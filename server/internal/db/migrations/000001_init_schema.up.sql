-- LOCALITIES (service areas)
CREATE TABLE localities (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'Hyderabad',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ADMINS (super admin + locality admins)
CREATE TABLE admins (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255),
    role TEXT NOT NULL DEFAULT 'locality',
    locality_id BIGINT REFERENCES localities(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_admins_phone ON admins(phone);

-- DELIVERY PARTNERS (assigned to locality admin)
CREATE TABLE delivery_partners (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255),
    admin_id BIGINT REFERENCES admins(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_delivery_partners_phone ON delivery_partners(phone);
CREATE INDEX idx_delivery_partners_admin ON delivery_partners(admin_id);

-- USERS (customers)
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255),
    address_line TEXT,
    landmark VARCHAR(255),
    locality_id BIGINT REFERENCES localities(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_locality ON users(locality_id);

-- GYMS (self-register, admin approves)
CREATE TABLE gyms (
    id BIGSERIAL PRIMARY KEY,
    phone VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    locality_id BIGINT REFERENCES localities(id),
    commission_percent DECIMAL(5,2) DEFAULT 10.00,
    status TEXT DEFAULT 'pending',
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_gyms_phone ON gyms(phone);
CREATE INDEX idx_gyms_locality ON gyms(locality_id);
CREATE INDEX idx_gyms_status ON gyms(status);

-- PRODUCTS (catalog)
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    unit VARCHAR(50),
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ORDERS
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    delivery_type TEXT NOT NULL,
    gym_id BIGINT REFERENCES gyms(id),
    delivery_date DATE NOT NULL,
    delivery_partner_id BIGINT REFERENCES delivery_partners(id),
    assigned_at TIMESTAMPTZ,
    pickup_code VARCHAR(6),
    picked_up_at TIMESTAMPTZ,
    total_amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2) DEFAULT 0,
    commission_paid BOOLEAN DEFAULT FALSE,
    commission_paid_at TIMESTAMPTZ,
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'pending',
    payment_method TEXT,
    payment_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_gym ON orders(gym_id);
CREATE INDEX idx_orders_delivery_date ON orders(delivery_date);
CREATE INDEX idx_orders_delivery_partner ON orders(delivery_partner_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ORDER ITEMS
CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    product_id BIGINT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- SEED: initial product
INSERT INTO products (name, description, price, unit, is_available)
VALUES
  ('Egg Vegetable Salad', 'Dry Indian-style salad with boiled eggs, onion, tomato, cucumber, green chilli, coriander, and a squeeze of lemon. Simple, healthy, protein-packed.', 79.00, 'plate', TRUE)
ON CONFLICT DO NOTHING;
