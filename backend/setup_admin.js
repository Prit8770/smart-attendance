require('dotenv').config();
const bcrypt = require('bcryptjs');
const { supabase } = require('./db');

async function createOrUpdateAdmin() {
  const email = 'admin@ljcca.edu';
  const plainPassword = 'ljcca@1999';
  const name = 'Administrator';

  console.log(`Checking for admin account: ${email}...`);

  try {
    // 1. Check if admin already exists
    const { data: existingAdmin, error: findError } = await supabase
      .from('admin')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      console.error('Error looking up admin:', findError.message);
    }

    // 2. Hash the new password
    const hashedPassword = bcrypt.hashSync(plainPassword, 10);

    if (existingAdmin) {
      console.log(`Admin account found (ID: ${existingAdmin.id}). Updating password...`);
      const { error: updateError } = await supabase
        .from('admin')
        .update({ password: hashedPassword, name: existingAdmin.name || name })
        .eq('email', email);

      if (updateError) {
        console.error('Failed to update admin:', updateError.message);
      } else {
        console.log('✅ Success! Admin credentials updated to:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${plainPassword}`);
      }
    } else {
      console.log('Admin account not found. Creating new admin account...');
      const { data, error: insertError } = await supabase
        .from('admin')
        .insert([{ email, password: hashedPassword, name }])
        .select();

      if (insertError) {
        console.error('Failed to create admin account via API:', insertError.message);
        console.log('\n--- HOW TO SOLVE (RLS Restriction) ---');
        console.log('Your Supabase database has Row Level Security (RLS) turned on for the "admin" table.');
        console.log('To insert the admin user directly, run this SQL query in your Supabase Dashboard -> SQL Editor:');
        console.log(`\nINSERT INTO admin (name, email, password)\nVALUES ('${name}', '${email}', '${hashedPassword}');\n`);
      } else {
        console.log('✅ Success! Admin account created successfully with:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${plainPassword}`);
      }
    }
  } catch (err) {
    console.error('An unexpected error occurred:', err.message);
    process.exit(1);
  }
  process.exit(0);
}

createOrUpdateAdmin();
