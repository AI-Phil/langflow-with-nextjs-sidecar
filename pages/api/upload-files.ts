// pages/api/upload-files.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, Fields, Files, File } from 'formidable';
import fs from 'fs';
import path from 'path';

// Disable Next.js body parsing, since we're handling it with `formidable`
export const config = {
  api: {
    bodyParser: false,
  },
};

// Use the environment variable or fallback to 'uploads'
const uploadDirectory = process.env.FILE_UPLOAD_DIRECTORY || path.join(process.cwd(), 'uploads');

// Extend File type to include webkitRelativePath
interface FileWithRelativePath extends File {
  webkitRelativePath?: string;
}

export default async function handleFileUpload(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  try {
    console.log('Starting file upload handling');

    const { fields, files } = await parseForm(req);

    const collectionName = extractField(fields, 'collectionName');
    const labels = extractLabels(fields);

    if (!collectionName) {
      return res.status(400).json({ success: false, message: 'Collection name is required.' });
    }

    const collectionPath = path.join(uploadDirectory, collectionName);
    if (fs.existsSync(collectionPath)) {
      return res.status(409).json({ success: false, message: 'Collection already exists.' });
    }

    fs.mkdirSync(collectionPath, { recursive: true });
    console.log('Created collection directory:', collectionPath);

    const uploadedFiles = Array.isArray(files.files) ? files.files : [files.files];
    const validFiles = uploadedFiles.filter((file): file is FileWithRelativePath => file !== undefined);

    handleFiles(validFiles, collectionPath);
    saveMetadata(collectionPath, labels);

    console.log('File upload handling completed successfully.');
    return res.status(200).json({ success: true, message: 'Files uploaded successfully.' });
  } catch (error) {
    console.error('Error processing file upload:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'An unknown error occurred.',
    });
  }
}

// Parse the incoming form data
async function parseForm(req: NextApiRequest): Promise<{ fields: Fields; files: Files }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: true, keepExtensions: true });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      resolve({ fields, files });
    });
  });
}

// Extract a specific field from the form data
function extractField(fields: Fields, fieldName: string): string | undefined {
  const value = fields[fieldName];
  return Array.isArray(value) ? value[0] : value;
}

// Extract labels from the form data
function extractLabels(fields: Fields): object {
  const labelsField = extractField(fields, 'labels');
  return labelsField ? JSON.parse(labelsField) : {};
}

// Handle file copying to the correct destination
function handleFiles(files: FileWithRelativePath[], collectionPath: string) {
  files.forEach((file) => {
    const relativePath = file.webkitRelativePath || file.originalFilename || file.newFilename;
    const isPartOfDirectory = relativePath.includes('/');
    const destinationPath = isPartOfDirectory
      ? path.join(collectionPath, relativePath)
      : path.join(collectionPath, path.basename(relativePath));

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(file.filepath, destinationPath);
    console.log('Copied file to:', destinationPath);
  });
}

// Save metadata to the collection path
function saveMetadata(collectionPath: string, labels: object) {
  const metadataPath = path.join(collectionPath, '.metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(labels, null, 2));
  console.log('Metadata saved to:', metadataPath);
}
