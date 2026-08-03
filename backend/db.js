require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Since we are using the ANON KEY in a backend context, you must ensure that
// Row Level Security (RLS) on your Supabase tables allows public/anon access,
// OR you must disable RLS entirely for these tables in the Supabase Dashboard,
// because our Express.js backend handles the authentication rules instead.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://diicgeybjhzfkogafiky.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpaWNnZXliamh6ZmtvZ2FmaWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0ODQ2NjAsImV4cCI6MjEwMTA2MDY2MH0.rKiJAxqePvj-O0cWD6iSCauEiA3zYIh2tO1fSzszYGk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Legacy stub to prevent immediate crashes during the rewrite process
const dbQuery = {
  all: async () => [],
  get: async () => null,
  run: async () => {}
};

module.exports = {
  supabase,
  dbQuery
};
