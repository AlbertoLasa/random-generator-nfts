const dotenv = require('dotenv');
dotenv.config();

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const rfs = require("recursive-fs");
const FormData = require('form-data');
const axios = require('axios'); 

// Function to upload a directory to IPFS
async function uploadFilesToIPFS(directoryPath, collectionName) {
  try {
    // Check if the directory size is too large
    const maxChunkSize = 15 * 1024 * 1024 * 1024; // 15 GB
    const totalSize = await getTotalSize(directoryPath);

    if (totalSize > maxChunkSize){
      throw new Error('Directory size is too large to upload to IPFS');
    }

    // Get the list of files in the directory
    const { files } = await new Promise((resolve, reject) => {
      rfs.readdirr(directoryPath, (err, dirs, files) => {
        if (err) reject(err);
        else resolve({ dirs, files });
      });
    });

    // for each file in the directory, create a form data object
    let data = new FormData();
    for (const file of files) {
      data.append('file', fs.createReadStream(file), {
        filepath: path.join('images', path.relative(directoryPath, file))
      });
    }

    // Set the options for the upload
    const options = {
      pinataMetadata: {
        name: collectionName
      },
      pinataOptions: {
        cidVersion: 1,
        wrapWithDirectory: false
      }
    };

    // Add the options to the form data
    data.append('pinataMetadata', JSON.stringify(options.pinataMetadata));
    data.append('pinataOptions', JSON.stringify(options.pinataOptions));

    // Upload the files to IPFS
    const filesResponse = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', data, {
        headers: {
        ...data.getHeaders(),
        "Authorization": `Bearer ${process.env.PINATA_JWT}`,
        },
    });
    
    // Return the IPFS hash
    return filesResponse.data.IpfsHash;
  } catch (error) {
    // Log the error and throw an exception
    console.error(error);
    throw new Error('Failed to upload files to IPFS: ' + error.message);
  }
}

// Function to get the total size of a directory
async function getTotalSize(directoryPath) {
  let totalSize = 0;

  async function calculateSize(directory) {
    const files = await fsp.readdir(directory, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(directory, file.name);
      if (file.isDirectory()) {
        await calculateSize(filePath);
      } else {
        const fileStats = await fsp.stat(filePath);
        totalSize += fileStats.size;
      }
    }
  }

  await calculateSize(directoryPath);
  return totalSize;
}

module.exports = {
  uploadFilesToIPFS
};
