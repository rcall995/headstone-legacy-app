import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Ensure the header_presets table exists
async function ensureTable() {
    // Check if table exists by trying to query it
    const { error } = await supabase
        .from('header_presets')
        .select('id')
        .limit(1);

    if (error && error.code === '42P01') {
        // Table doesn't exist, create it via raw SQL
        // Note: This requires the table to be created via Supabase dashboard
        return false;
    }
    return true;
}

// Default presets to seed if table is empty
const DEFAULT_PRESETS = [
    { name: 'default', label: 'Teal', image_url: 'gradient:linear-gradient(135deg, #005F60 0%, #007a7a 50%, #00959a 100%)', display_order: 1, is_default: true },
    { name: 'sunset-sky', label: 'Sunset', image_url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=400&h=200&fit=crop', display_order: 2 },
    { name: 'forest-path', label: 'Forest', image_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&h=200&fit=crop', display_order: 3 },
    { name: 'ocean-waves', label: 'Beach', image_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=200&fit=crop', display_order: 4 },
    { name: 'mountain-peaks', label: 'Mountains', image_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=200&fit=crop', display_order: 5 },
    { name: 'clouds', label: 'Sky', image_url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=400&h=200&fit=crop', display_order: 6 },
    { name: 'autumn-leaves', label: 'Autumn', image_url: 'https://images.unsplash.com/photo-1760370048204-1abcd672609f?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1760370048204-1abcd672609f?w=400&h=200&fit=crop', display_order: 7 },
    { name: 'starry-night', label: 'Stars', image_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=200&fit=crop', display_order: 8 },
    { name: 'buffalo-skyline', label: 'Buffalo', image_url: 'https://images.unsplash.com/photo-1594050304868-c9299fdba722?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1594050304868-c9299fdba722?w=400&h=200&fit=crop', display_order: 9 },
    { name: 'nyc-skyline', label: 'NYC', image_url: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=400&h=200&fit=crop', display_order: 10 },
    { name: 'phoenix-skyline', label: 'Phoenix', image_url: 'https://images.unsplash.com/photo-1688066212257-3bb83619d81b?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1688066212257-3bb83619d81b?w=400&h=200&fit=crop', display_order: 11 },
    { name: 'niagara-falls', label: 'Niagara', image_url: 'https://images.unsplash.com/photo-1489447068241-b3490214e879?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1489447068241-b3490214e879?w=400&h=200&fit=crop', display_order: 12 },
    { name: 'sedona-az', label: 'Sedona', image_url: 'https://images.unsplash.com/photo-1702260031554-0c3a45de71d3?w=1920&h=400&fit=crop', preview_url: 'https://images.unsplash.com/photo-1702260031554-0c3a45de71d3?w=400&h=200&fit=crop', display_order: 13 }
];

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { action } = req.query;

    try {
        // GET: List all presets
        if (req.method === 'GET' && (!action || action === 'list')) {
            const { data, error } = await supabase
                .from('header_presets')
                .select('*')
                .order('display_order', { ascending: true });

            if (error) {
                // If table doesn't exist, return default presets
                if (error.code === '42P01') {
                    return res.status(200).json({
                        presets: DEFAULT_PRESETS,
                        tableExists: false,
                        message: 'Using default presets. Create the header_presets table to enable custom presets.'
                    });
                }
                throw error;
            }

            return res.status(200).json({ presets: data, tableExists: true });
        }

        // POST: Add new preset
        if (req.method === 'POST' && action === 'add') {
            const { name, label, image_url, preview_url } = req.body;

            if (!name || !label || !image_url) {
                return res.status(400).json({ error: 'name, label, and image_url are required' });
            }

            // Get max display order
            const { data: maxOrder } = await supabase
                .from('header_presets')
                .select('display_order')
                .order('display_order', { ascending: false })
                .limit(1)
                .single();

            const newOrder = (maxOrder?.display_order || 0) + 1;

            const { data, error } = await supabase
                .from('header_presets')
                .insert({
                    name: name.toLowerCase().replace(/\s+/g, '-'),
                    label,
                    image_url,
                    preview_url: preview_url || image_url.replace('w=1920', 'w=400').replace('h=400', 'h=200'),
                    display_order: newOrder
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ preset: data });
        }

        // POST: Upload image and create preset
        if (req.method === 'POST' && action === 'upload') {
            const { label, imageData, fileName } = req.body;

            if (!label || !imageData) {
                return res.status(400).json({ error: 'label and imageData are required' });
            }

            // Decode base64 image
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            // Upload to storage
            const safeName = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const path = `header-presets/${safeName}-${Date.now()}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('memorials')
                .upload(path, buffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('memorials')
                .getPublicUrl(path);

            const imageUrl = urlData.publicUrl;

            // Get max display order
            const { data: maxOrder } = await supabase
                .from('header_presets')
                .select('display_order')
                .order('display_order', { ascending: false })
                .limit(1)
                .single();

            const newOrder = (maxOrder?.display_order || 0) + 1;

            // Create preset record
            const { data, error } = await supabase
                .from('header_presets')
                .insert({
                    name: safeName,
                    label,
                    image_url: imageUrl,
                    preview_url: imageUrl, // Same image, browser will handle sizing
                    display_order: newOrder
                })
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ preset: data });
        }

        // PUT: Update preset
        if (req.method === 'PUT') {
            const { id, ...updates } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'id is required' });
            }

            const { data, error } = await supabase
                .from('header_presets')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ preset: data });
        }

        // DELETE: Remove preset
        if (req.method === 'DELETE') {
            const { id } = req.body;

            if (!id) {
                return res.status(400).json({ error: 'id is required' });
            }

            const { error } = await supabase
                .from('header_presets')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.status(200).json({ success: true });
        }

        // POST: Reorder presets
        if (req.method === 'POST' && action === 'reorder') {
            const { order } = req.body; // Array of { id, display_order }

            if (!order || !Array.isArray(order)) {
                return res.status(400).json({ error: 'order array is required' });
            }

            for (const item of order) {
                await supabase
                    .from('header_presets')
                    .update({ display_order: item.display_order })
                    .eq('id', item.id);
            }

            return res.status(200).json({ success: true });
        }

        // POST: Initialize table with defaults
        if (req.method === 'POST' && action === 'init') {
            // Check if table has data
            const { data: existing } = await supabase
                .from('header_presets')
                .select('id')
                .limit(1);

            if (existing && existing.length > 0) {
                return res.status(200).json({ message: 'Table already has data', count: existing.length });
            }

            // Insert defaults
            const { data, error } = await supabase
                .from('header_presets')
                .insert(DEFAULT_PRESETS)
                .select();

            if (error) throw error;
            return res.status(200).json({ message: 'Initialized with defaults', count: data.length });
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('Header presets API error:', error);
        return res.status(500).json({ error: error.message });
    }
}
