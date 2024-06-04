# NFT Generation and Metadata Upload

This repository contains code for generating NFT images by combining layers from segments and uploading them to IPFS via Pinata. Additionally, it provides functionality to upload a collection of metadata from an Excel file to IPFS.

## Prerequisites

Before running the code, make sure you have the following installed:

- Node.js
- npm or yarn
- Canvas dependencies (if not installed already, follow the instructions for your operating system from [node-canvas](https://github.com/Automattic/node-canvas))

## Setup

1. Clone this repository to your local machine.

```bash
git clone https://github.com/your-username/your-repo.git
```

2. Navigate to the project directory.

```bash
cd your-repo
```

3. Install dependencies.

```bash
npm install
```

or

```bash
yarn install
```

4. Create a `.env` file in the root directory and add your Pinata API keys.

```
PINATA_API_KEY=your-pinata-api-key
PINATA_SECRET_API_KEY=your-pinata-secret-api-key
JWT_SECRET=your-jwt-secret
```

## Usage

### Generating NFT Images

To generate an NFT image, send a POST request to the `/generate` endpoint with the base URL of the segment images. The request body should be in JSON format with the following structure:

```json
{
  "baseUrl": "https://your-domain.com/segments"
}
```

Replace `"https://your-domain.com/segments"` with the actual base URL of your segment images.

### Uploading Metadata

To upload metadata from an Excel file to IPFS, send a POST request to the `/upload-metadata` endpoint with the Excel file. Make sure the Excel file contains metadata in the following format:

| name        | description           | image                      | attributes           |
|-------------|-----------------------|----------------------------|----------------------|
| NFT Name 1  | Description of NFT 1  | https://example.com/nft1.png | {"trait": "value"}  |
| NFT Name 2  | Description of NFT 2  | https://example.com/nft2.png | {"trait": "value"}  |
| ...         | ...                   | ...                        | ...                  |

### Authentication

Both endpoints require a valid JWT token in the `Authorization` header. Make sure to include the token when making requests.

## License

This project is licensed under the [MIT License](LICENSE).
