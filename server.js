const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const supabaseurl = process.env.SUPABASE_URL;
const supabasekey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseurl, supabasekey);

// Commission charged only on "through team" sales. Configurable via env, defaults to 8%.
const COMMISSION_RATE = process.env.COMMISSION_RATE ? parseFloat(process.env.COMMISSION_RATE) : 0.08;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Prefer serving a `public/` folder if present (works well locally and on many hosts).
// Fallback to project root for older setups.
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory()) {
    app.use(express.static(publicDir));
} else {
    app.use(express.static(__dirname));
}

// ---- Lightweight admin protection ----
// Not full auth (that's a separate phase), but stops anyone from hitting
// admin endpoints directly without the admin password.
function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin password not configured' });
    const configured = process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim();
    const provided = key && String(key).trim();
    if (provided !== configured) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

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

app.post('/api/products', requireAdmin, async (req, res) => {
    const { name, price = 0, stock = 0, description = '', images = [], sellerName, sellerPhone, dealType = 'direct' } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!['direct', 'team', 'both'].includes(dealType)) return res.status(400).json({ error: 'Invalid dealType' });
    const { data, error } = await supabase.from('products')
        .insert([{ name, price, stock, description, images, sellerName, sellerPhone, deal_type: dealType }])
        .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.put('/api/products/:id', requireAdmin, async (req, res) => {
    const updates = req.body;
    const { data, error } = await supabase.from('products').update(updates).eq('id', req.params.id).select().single();
    if (error) return res.status(404).json({ error: 'Product not found or update failed' });
    res.json(data);
});

app.delete('/api/products/:id', requireAdmin, async (req, res) => {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ---- Sales / deal requests ----
// Direct deals happen off-platform (WhatsApp) and are never recorded here.
// Team-mediated deals go through this endpoint, get a commission, and start as "pending".
app.post('/api/sales', async (req, res) => {
    const { productId, quantity, buyerName, buyerPhone, dealType = 'team' } = req.body;
    if (!productId || !quantity) return res.status(400).json({ error: 'productId and quantity required' });
    if (!buyerName || !buyerPhone) return res.status(400).json({ error: 'buyerName and buyerPhone required' });

    const { data: product, error: getErr } = await supabase.from('products').select('*').eq('id', productId).single();
    if (getErr || !product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock < quantity) return res.status(400).json({ error: 'Insufficient stock' });

    const newStock = product.stock - quantity;
    const { error: updateErr } = await supabase.from('products').update({ stock: newStock }).eq('id', productId);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    const commissionAmount = dealType === 'team' ? Math.round(product.price * quantity * COMMISSION_RATE) : 0;

    const saleRow = {
        product_id: productId,
        quantity,
        buyer: buyerName,
        buyer_phone: buyerPhone,
        deal_type: dealType,
        commission_amount: commissionAmount,
        status: 'pending',
        date: new Date().toISOString()
    };
    const { data: sale, error: saleErr } = await supabase.from('sales').insert([saleRow]).select().single();
    if (saleErr) return res.status(500).json({ error: saleErr.message });
    res.status(201).json(sale);
});

// Admin: view all team-deal requests (with product name attached)
app.get('/api/sales', requireAdmin, async (req, res) => {
    const { data: sales, error } = await supabase.from('sales').select('*').order('date', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const productIds = [...new Set((sales || []).map(s => s.product_id))];
    let productsById = {};
    if (productIds.length) {
        const { data: products } = await supabase.from('products').select('id,name,price').in('id', productIds);
        (products || []).forEach(p => { productsById[p.id] = p; });
    }

    const enriched = (sales || []).map(s => ({ ...s, product: productsById[s.product_id] || null }));
    res.json(enriched);
});

// Admin: mark a team-deal request as fulfilled
app.put('/api/sales/:id', requireAdmin, async (req, res) => {
    const { status } = req.body;
    if (!['pending', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { data, error } = await supabase.from('sales').update({ status }).eq('id', req.params.id).select().single();
    if (error) return res.status(404).json({ error: 'Sale not found or update failed' });
    res.json(data);
});

// Simple admin login (use ADMIN_PASSWORD in .env)
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin password not configured' });
    const configured = process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim();
    const provided = password && String(password).trim();
    if (provided === configured) return res.json({ success: true });
    res.status(401).json({ error: 'Invalid credentials' });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
