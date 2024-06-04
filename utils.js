const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

// Function to compress an image
async function compressImage(inputPath, outputPath, widthBase, heightBase, quality = 100) {
  try {
    await sharp(inputPath)
      .resize(widthBase, heightBase) // Resize image
      .toFormat('png') // Ensure PNG format
      .png({ quality }) // Compression quality
      .toFile(outputPath);

    const stats = await fs.stat(outputPath);
    if (stats.size > 10 * 1024 * 1024) { // If the size is greater than 10 MB, compress further
      if (quality > 10) {
        return compressImage(inputPath, outputPath, widthBase, heightBase, quality - 5); // Reduce quality and try again
      } else {
        throw new Error('Unable to compress image to under 10 MB');
      }
    }
  } catch (error) {
    throw new Error(`Failed to compress image: ${error.message}`);
  }
}

// Function to get and validate segment images from the base URL
async function getSegmentImages(imagesFolderPath) {
  // segments: [ { images: [ { file: 'path/to/image.png', weight: 50 }, ... ] }, ... ]
  const segments = [];

  try {
    // Get the list of segment folders
    const foldersPath = path.join(__dirname, 'images', imagesFolderPath); 
    const segmentFolders = await fs.readdir(foldersPath);

    // Validate the segment folders
    const segmentNumbers = segmentFolders.map(folder => {
      const num = parseInt(folder);
      if (isNaN(num) || !/^\d+$/.test(folder)) {
        throw new Error(`Segment folder name must be a number: ${folder}`);
      }
      return num;
    });

    // Sort the segment numbers
    segmentNumbers.sort((a, b) => a - b);

    // Validate the segment numbers
    if (segmentNumbers.length < 1 || segmentNumbers.length > 100) {
      throw new Error('The number of segments must be between 1 and 100.');
    }

    // Check if the segment folders are numbered correctly
    for (let i = 0; i < segmentNumbers.length; i++) {
      if (segmentNumbers[i] !== i) {
        throw new Error(`Segment folder ${i} is missing or misnamed.`);
      }
    }

    // Get the images from each segment folder
    for (const segmentFolder of segmentFolders) {
      const segmentPath = path.join(__dirname, 'images', imagesFolderPath, segmentFolder);
      const imageFiles = await fs.readdir(segmentPath);

      const images = imageFiles.map(file => {
        // trait_type-value-weight-number.png
        const filenameRegex = /^[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ]+-[a-zA-Z0-9áéíóúÁÉÍÓÚüÜñÑ]+-\d+-\d+\.png$/;
        if (!filenameRegex.test(file)) {
          throw new Error(`Invalid image file name: ${file}`);
        }

        // Extract the weight from the file name
        const [,, weight,] = file.split('-');
        const weightNumber = parseInt(weight, 10);

        // Validate the weight
        if (isNaN(weightNumber) || weightNumber < 1 || weightNumber > 100) {
          throw new Error(`Invalid weight in file name: ${file}`);
        }

        // Return the image object
        return {
          file: `${segmentPath}/${file}`,
          weight: weightNumber
        };
      });

      // Validate the number of images
      if (images.length < 1 || images.length > 100) {
        throw new Error(`The number of images in segment ${segmentFolder} must be between 1 and 100.`);
      }

      // Check for duplicate file names
      const elementNames = new Set(images.map(el => el.file));
      if (elementNames.size !== images.length) {
        throw new Error(`Duplicate file names found in segment ${segmentFolder}.`);
      }

      // Add the segment to the segments array
      segments.push({ images });
    }
  } catch (error) {
    // Log and throw an error
    console.error('Error fetching segment images:', error);
    throw new Error('Failed to fetch segment images: ', error);
  }

  // Return the segments
  return segments;
}

// Helper function to get a random element based on weights
async function getRandomElement(elements) {
  const totalWeight = elements.reduce((sum, el) => sum + el.weight, 0);
  const random = Math.floor(Math.random() * totalWeight);
  let sum = 0;

  for (let el of elements) {
    sum += el.weight;
    if (random < sum) {
      return el;
    }
  }
};

module.exports = {
  compressImage,
  getSegmentImages,
  getRandomElement
};