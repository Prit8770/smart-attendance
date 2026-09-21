const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db');
const { authenticateJWT } = require('./auth');
const { notifyChange } = require('../syncEmitter');

const rulesFilePath = path.join(__dirname, '../data/defaulter_rules.json');
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getLocalRules() {
  if (fs.existsSync(rulesFilePath)) {
    try {
      const content = fs.readFileSync(rulesFilePath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        // Filter out legacy hardcoded dummy rules
        return parsed.filter(r => !(r.id === 1 && r.name === 'Engineering Theory Cutoff') && !(r.id === 2 && r.name === 'Critical Defaulter Threshold'));
      }
      return [];
    } catch (e) {
      console.error('Error reading defaulter_rules.json:', e);
      return [];
    }
  }
  return [];
}

function saveLocalRules(rules) {
  try {
    fs.writeFileSync(rulesFilePath, JSON.stringify(rules, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing defaulter_rules.json:', e);
  }
}

// GET /api/rules - Fetch all active rules (Empty by default until user adds)
router.get('/', async (req, res) => {
  try {
    // 1. Try Supabase settings table if available
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'defaulter_rules')
        .maybeSingle();
      if (!error && data && data.value) {
        const parsed = JSON.parse(data.value);
        if (Array.isArray(parsed)) {
          const clean = parsed.filter(r => !(r.id === 1 && r.name === 'Engineering Theory Cutoff') && !(r.id === 2 && r.name === 'Critical Defaulter Threshold'));
          return res.json(clean);
        }
      }
    } catch (e) {}

    // 2. Return local JSON rules (strictly empty if not added by user)
    const local = getLocalRules();
    return res.json(local);
  } catch (err) {
    console.error('Error fetching rules:', err);
    return res.status(500).json({ error: 'Failed to fetch rules.' });
  }
});

// POST /api/rules - Save/update all rules (Admin only)
router.post('/', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { rules } = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ error: 'Rules must be an array.' });
  }

  try {
    const cleanRules = rules.filter(r => !(r.id === 1 && r.name === 'Engineering Theory Cutoff') && !(r.id === 2 && r.name === 'Critical Defaulter Threshold'));

    // Save to Supabase settings if possible
    try {
      await supabase.from('settings').upsert({
        key: 'defaulter_rules',
        value: JSON.stringify(cleanRules)
      });
    } catch (dbErr) {
      console.warn('Supabase rules save fallback:', dbErr.message);
    }

    // Save to local JSON
    saveLocalRules(cleanRules);

    notifyChange('DATA_CHANGED', { entity: 'rules', count: cleanRules.length });

    return res.json({
      success: true,
      message: 'Rules saved successfully.',
      rules: cleanRules
    });
  } catch (err) {
    console.error('Error saving rules:', err);
    return res.status(500).json({ error: 'Failed to save rules.' });
  }
});

// DELETE /api/rules/:id - Delete a specific rule (Admin only)
router.delete('/:id', authenticateJWT, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const targetId = req.params.id;
  try {
    const local = getLocalRules();
    const updated = local.filter(r => String(r.id) !== String(targetId));

    try {
      await supabase.from('settings').upsert({
        key: 'defaulter_rules',
        value: JSON.stringify(updated)
      });
    } catch (e) {}

    saveLocalRules(updated);

    notifyChange('DATA_CHANGED', { entity: 'rules', action: 'delete', targetId });

    return res.json({
      success: true,
      message: 'Rule deleted successfully.',
      rules: updated
    });
  } catch (err) {
    console.error('Error deleting rule:', err);
    return res.status(500).json({ error: 'Failed to delete rule.' });
  }
});

module.exports = router;
