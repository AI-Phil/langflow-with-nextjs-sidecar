// pages/api/upload-progress.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { progressStore, ProgressData } from '../../lib/progressStore';

export default function handleProgress(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res
      .status(405)
      .json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  const { uploadId } = req.query;

  console.log('Received progress request for Upload ID:', uploadId);

  if (!uploadId || typeof uploadId !== 'string') {
    return res
      .status(400)
      .json({ success: false, message: 'uploadId is required.' });
  }

  const progress = progressStore.get(uploadId);

  if (!progress) {
    console.log(`Progress not found for Upload ID: ${uploadId}`);
    return res
      .status(404)
      .json({ success: false, message: 'Progress not found for the given uploadId.' });
  }

  console.log(`Progress for Upload ID ${uploadId}:`, progress);
  return res.status(200).json(progress);
}
