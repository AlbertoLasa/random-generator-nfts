# Service Documentation

## General Description

This service provides a RESTful API for uploading, decompressing, and processing ZIP files containing images. It generates combined images from segmented layers and uploads both the resulting images and associated metadata to IPFS via Pinata. It is developed using `Node.js` and `Express`, leveraging various libraries for image manipulation, file decompression, and data validation.

## Requirements

- Node.js and npm installed.
- Environment variables configured in a `.env` file:
  - `PINATA_JWT`: JWT token for authenticating uploads to Pinata.

## Installation

1. Clone the repository:
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Create a `.env` file in the root directory and add the following environment variables:
    ```
    PINATA_JWT=<your-pinata-jwt-token>
    ```

## Usage

### Starting the Server

To start the server, run:
```bash
node index