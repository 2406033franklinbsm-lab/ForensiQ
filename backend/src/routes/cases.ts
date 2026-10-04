import { Router } from 'express';
import { pool } from '../db';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cases ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch cases' });
  }
});

router.post('/', async (req, res) => {
  const { case_number, title, description, location } = req.body;
  if (!case_number || !title) {
    return res.status(400).json({ message: 'case_number and title are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO cases (case_number, title, description, location)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [case_number, title, description || null, location || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Case number already exists' });
    }
    console.error(err);
    res.status(500).json({ message: 'Failed to create case' });
  }
});

export default router;