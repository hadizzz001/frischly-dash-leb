const mongoose = require('mongoose');
const Category = require('../src/models/Category');
const Subcategory = require('../src/models/Subcategory');
require('dotenv').config();

async function checkDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  console.log('Categories:');
  const cats = await Category.find({});
  cats.forEach(c => console.log(`- ${c.name} (ID: ${c._id})`));
  
  console.log('\nSubcategories:');
  const subs = await Subcategory.find({}).populate('parentCategory', 'name');
  subs.forEach(s => console.log(`- ${s.name} -> ${s.parentCategory?.name} (ID: ${s._id})`));
  
  mongoose.disconnect();
}

checkDB().catch(console.error);