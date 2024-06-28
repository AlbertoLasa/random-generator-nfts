const express = require('express');
const fs = require('fs');
const fsn = require('fs').promises;
const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const asyncHandler = require('express-async-handler');
const { z } = require('zod');
const dotenv = require('dotenv');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const { verifyToken } = require('./jwt');

const { compressImage, getSegmentImages, getRandomElement } = require('./utils.js');
const { uploadFilesToIPFS } = require('./pinata.js');

dotenv.config();

const app = express();
const port = 3000;

// Define schemas for validation
const gatewayPinataSchema = z.string().url();
const collectionNameSchema = z.string().min(3);
const collectionDescriptionSchema = z.string().optional();
const imagesFolderPathSchema = z.string(3);
const authorSchema = z.string().optional();
const externalUrlSchema = z.string().url().optional();
const animationUrlSchema = z.string().url().optional();
const youtubeUrlSchema = z.string().url().optional();
const countSchema = z.number().min(1).max(1000);

app.use(express.json({ limit: '500mb' }));
app.use(cors());

// Multer setup
const mkdirp = require('mkdirp');
const multer = require('multer');
const upload = multer({
  dest: 'images/',
  limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5GB
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname) !== '.zip') {
      return cb(new Error('Only ZIP files are allowed'));
    }
    cb(null, true);
  }
});
const unzipper = require('unzipper');

// Endpoint to upload a ZIP file and extract it
app.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    // Verfify if a file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file has been uploaded' });
    }

    // Get the uploaded file
    const file = req.file;

    // Create a random folder ID
    const randomFolderId = uuidv4();
    // Create a directory for the uploaded files
    const baseDir = path.join(__dirname, 'images');
    mkdirp.sync(baseDir);
    const uploadDir = path.join(baseDir, randomFolderId);
    mkdirp.sync(uploadDir);

    setTimeout(() => {
      if (fs.existsSync(uploadDir)) {
        removeDirectory(uploadDir);
        console.log(`Dirctory ${uploadDir} removed.`);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    // Filter out unwanted files and directories
    fs.createReadStream(file.path)
      .pipe(unzipper.Parse())
      .on('entry', (entry) => {
        const fileName = entry.path;
        const fileType = path.extname(fileName).toLowerCase();
        const allowedExtensions = ['.png'];
        const ignorePatterns = [
          '__MACOSX',
          'Thumbs.db',
          'desktop.ini',
          '.DS_Store'
        ];

        // Filter out unwanted files and directories
        if (ignorePatterns.some(pattern => fileName.includes(pattern)) || (!allowedExtensions.includes(fileType) && entry.type !== 'Directory')) {
          entry.autodrain();
        } else {
          let filePath = path.join(uploadDir, fileName);
          filePath = path.join(uploadDir, fileName.split('/').slice(1).join('/'));
          if (entry.type === 'Directory') {
            mkdirp.sync(filePath);
            entry.autodrain();
          } else {
            mkdirp.sync(path.dirname(filePath));
            entry.pipe(fs.createWriteStream(filePath))
              .on('error', err => {
                console.error('Error when writing the file:', err);
                entry.autodrain();
              });
          }
        }
      })
      .on('close', () => {
        res.json({ message: 'Archive uploaded and decompressed successfully', folderId: randomFolderId });
      })
      .on('error', (err) => {
        console.error('Error when decompressing the file:', err);
        res.status(500).json({ error: 'Error when decompressing the file' });
      });
  } catch (error) {
    // Log and return an error
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Size limit exceeded' });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Error up and break down the file' });
    }
  }
});

// Endpoint to generate images by combining layers from segments and upload them to IPFS via Pinata
app.post('/generate', verifyToken, asyncHandler(async (req, res) => {
  // Define schemas for validation
  const validationSchemas = {
    gatewayPinata: gatewayPinataSchema,
    collectionName: collectionNameSchema,
    collectionDescription: collectionDescriptionSchema,
    imagesFolderPath: imagesFolderPathSchema,
    author: authorSchema,
    external_url: externalUrlSchema,
    youtube_url: youtubeUrlSchema,
    animation_url: animationUrlSchema,
    count: countSchema,
  };

  // Validate request body
  let validatedRequestBody;
  try {
    validatedRequestBody = Object.fromEntries(
      Object.entries(validationSchemas).map(([key, schema]) => {
        try {
          return [key, schema.parse(req.body[key])];
        } catch (e) {
          if (e instanceof z.ZodError) {
            throw new Error(`Invalid format for parameter "${key}": ${e.errors.map(err => err.message).join(', ')}`);
          } else {
            throw new Error(`Missing parameter "${key}"`);
          }
        }
      })
    );
  } catch (error) {
    return res.status(400).json({ error: 'Bad Request', details: error.message });
  }

  const {
    gatewayPinata,
    collectionName,
    collectionDescription,
    imagesFolderPath,
    author,
    external_url,
    youtube_url,
    animation_url,
    count
  } = validatedRequestBody;

  if (gatewayPinata.endsWith('/')) {
    gatewayPinata = gatewayPinata.slice(0, -1);
  }

  if (gatewayPinata.endsWith('/ipfs/')) {
    gatewayPinata = gatewayPinata.slice(0, -6);
  }

  const randomFolderId = uuidv4();
  const outputDir = path.join(__dirname, 'tmp', `output-${randomFolderId}`);
  const imageDir = path.join(outputDir, 'images');
  const metadataDir = path.join(outputDir, 'metadata');
  const compressedDir = path.join(imageDir, 'compressed');

  try {
    // Create directories for images, metadata, and compressed images
    await fsn.mkdir(imageDir, { recursive: true });
    await fsn.mkdir(metadataDir, { recursive: true });
    await fsn.mkdir(compressedDir, { recursive: true });

    // Get the segments from the images folder
    const segments = await getSegmentImages(imagesFolderPath);

    // width and height of the images
    const width = 2048;
    const height = 2048;

    // Attributes for metadata
    const attributes = [];

    // Generate images with names that include the attributes
    for (let i = 0; i < count; i++) {
      // Canvas setup
      let canvas;
      let ctx;

      // Width and height of the first image
      let widthBase = 0;
      let heightBase = 0;

      // Attributes for the image
      const imageAttributes = [];

      for (const segment of segments) {
        // Get a random element from the segment
        const randomElement = await getRandomElement(segment.images);
        const file = randomElement.file;
        const baseName = path.basename(file);
        // Extract the trait type and value from the filename
        const [traitType, valueTraitType, weight,] = baseName.split('-');

        const image = await loadImage(file);

        if (widthBase === 0 && heightBase === 0) {
          // Set the base dimensions for the first image
          widthBase = image.width;
          heightBase = image.height;
          // Canvas setup
          canvas = createCanvas(width, height);
          ctx = canvas.getContext('2d');
        } else {
          if (widthBase >= heightBase) {
            if (widthBase / heightBase !== image.width / image.height) {
              removeDirectory(outputDir);
              return res.status(400).json({ error: `Image dimensions do not match: ${imageName}` });
            }
          } else {
            if (heightBase / widthBase !== image.height / image.width) {
              removeDirectory(outputDir);
              return res.status(400).json({ error: `Image dimensions do not match: ${imageName}` });
            }
          }
        }

        // Draw the image on the canvas
        ctx.drawImage(image, 0, 0, width, height);

        // Add the trait type and value to the attributes
        imageAttributes.push({ trait_type: traitType, value: valueTraitType });
      }

      // Filename for the generated image
      const fileName = `${i}.png`;

      // Save the canvas to a file
      const buffer = canvas.toBuffer('image/png');
      const outputPath = path.join(imageDir, fileName);
      await fsn.writeFile(outputPath, buffer);

      // Compress the generated image to ensure it does not exceed 10 MB
      const compressedOutputPath = path.join(compressedDir, `${fileName}`);
      await compressImage(outputPath, compressedOutputPath);

      // Add the attributes to the main attributes array
      attributes.push(imageAttributes);
    }

    // Upload all images to IPFS
    const randomFolderIdPath = path.join(__dirname, 'tmp', `output-${randomFolderId}`, 'images', 'compressed');
    const hashesImg = await uploadFilesToIPFS(randomFolderIdPath, collectionName);

    /////////////////////////////////////////// METADATA ///////////////////////////////////////////

    // Generate metadata for each image
    for (let i = 0; i < count; i++) {
      let metadata = {
        name: `${collectionName} #${i}`,
        image: `${gatewayPinata}/ipfs/${hashesImg}/${i}.png`,
        attributes: attributes[i]
      };

      if (collectionDescription !== undefined && collectionDescription.length > 0) {
        metadata = { ...metadata, description: collectionDescription };
      }
      if (external_url !== undefined && external_url.length > 0) {
        metadata = { ...metadata, external_url: external_url };
      }
      if (animation_url !== undefined && animation_url.length > 0) {
        metadata = { ...metadata, animation_url: animation_url };
      }
      if (youtube_url !== undefined && youtube_url.length > 0) {
        metadata = { ...metadata, youtube_url: youtube_url };
      }
      if (author !== undefined && author.length > 0) {
        metadata = { ...metadata, author: author };
      }

      const metadataPath = path.join(metadataDir, `${i}.json`);
      await fsn.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    // Upload the metadata to IPFS
    const metadataDirHashes = await uploadFilesToIPFS(metadataDir, collectionName);

    // Remove the temporary directory
    const outputDir = path.join(__dirname, 'tmp', `output-${randomFolderId}`);
    removeDirectory(outputDir);
    // Remove the original images folder
    const originImages = path.join(__dirname, 'images', `${imagesFolderPath}`);
    removeDirectory(originImages);

    // URL of the metadata folder
    const metadataDirUrl = `${gatewayPinata}/ipfs/${metadataDirHashes}`;
    // Return the URL of the metadata folder
    res.status(200).json({ message: 'Images and metadata generated and uploaded to IPFS!', metadataDirUrl });
  } catch (error) {
    // Remove the temporary directory
    const outputDir = path.join(__dirname, 'tmp', `output-${randomFolderId}`);
    removeDirectory(outputDir);

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Bad Request', details: error.errors });
    } else {
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  }
}));

// Function to remove a directory and its contents
async function removeDirectory(directory) {
  try {
    const files = await fsn.readdir(directory);
    await Promise.all(files.map(async (file) => {
      const curPath = path.join(directory, file);
      const stat = await fsn.lstat(curPath);
      if (stat.isDirectory()) {
        await removeDirectory(curPath);
      } else {
        await fsn.unlink(curPath);
      }
    }));
    await fsn.rmdir(directory);
  } catch (err) {
    console.error(`Error removing directory ${directory}:`, err);
  }
}
// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
