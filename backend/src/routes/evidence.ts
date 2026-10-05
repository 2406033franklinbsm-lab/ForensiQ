import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from '../db';

const router = Router();

// backend/uploads
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

// Upload evidence to a case
router.post('/cases/:caseId/evidence', upload.single('file'), async (req, res) => {
  const caseId = Number(req.params.caseId);
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: 'No file uploaded (field name must be "file")' });
  }

  try {
    const found = await pool.query('SELECT id FROM cases WHERE id = $1', [caseId]);
    if (found.rowCount === 0) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: 'Case not found' });
    }

    const sha256 = await hashFile(file.path);

    const result = await pool.query(
      `INSERT INTO evidence (case_id, file_name, file_type, file_path, sha256_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [caseId, file.originalname, file.mimetype, file.path, sha256]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save evidence' });
  }
});

// List evidence of a case
router.get('/cases/:caseId/evidence', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM evidence WHERE case_id = $1 ORDER BY uploaded_at DESC',
      [Number(req.params.caseId)]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch evidence' });
  }
});

// Verify that a file has not been changed
router.get('/evidence/:id/verify', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM evidence WHERE id = $1', [Number(req.params.id)]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Evidence not found' });
    }
    const ev = result.rows[0];
    if (!fs.existsSync(ev.file_path)) {
      return res.status(404).json({ message: 'File missing on disk' });
    }
    const currentHash = await hashFile(ev.file_path);
    const intact = currentHash === ev.sha256_hash;
    res.json({
      evidence_id: ev.id,
      status: intact ? 'intact' : 'TAMPERED',
      stored_hash: ev.sha256_hash,
      current_hash: currentHash,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Verification failed' });
  }
});

export default router;