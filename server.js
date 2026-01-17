const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

const supabaseurl = process.env.SUPABASE_URL;
const supabasekey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseurl, supabasekey);

app.use(cors());
app.use(express.json());
// Serve frontend static files from project root
app.use(express.static(__dirname));

// Products endpoints (using Supabase)
app.get('/api/products', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
});

app.get('/api/products/:id', async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').eq('id', req.params.id).single();
    if (error) return res.status(404).json({ error: 'Product not found' });
    res.json(data);
});

app.post('/api/products', async (req, res) => {
    const { name, price = 0, stock = 0, description = '', images = [], sellerName, sellerPhone } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    const { data, error } = await supabase.from('products').insert([{ name, price, stock, description, images, sellerName, sellerPhone }]).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.put('/api/products/:id', async (req, res) => {
    const updates = req.body;
    const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(404).json({ error: 'Product not found or update failed' });
    res.json(data);
});

app.delete('/api/products/:id', async (req, res) => {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// Sales endpoint (updates stock then records sale)
app.post('/api/sales', async (req, res) => {
    const { productId, quantity, buyer } = req.body;
    if (!productId || !quantity) return res.status(400).json({ error: 'productId and quantity required' });

    const { data: product, error: getErr } = await supabase.from('products').select('*').eq('id', productId).single();
    if (getErr || !product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ error: 'Insufficient stock' });

    // decrement stock
    const newStock = product.stock - quantity;
    const { error: updateErr } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    const saleRow = { product_id: productId, quantity, buyer: buyer || null, date: new Date().toISOString() };
    const { data: sale, error: saleErr } = await supabase.from('sales').insert([saleRow]).select().single();
    if (saleErr) return res.status(500).json({ error: saleErr.message });
    res.status(201).json(sale);
});

// Simple admin login (use ADMIN_PASSWORD in .env)
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin password not configured' });
    if (password === process.env.ADMIN_PASSWORD) return res.json({ success: true });
    res.status(401).json({ error: 'Invalid credentials' });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});