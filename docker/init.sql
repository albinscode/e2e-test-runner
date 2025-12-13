-- Initialize test database with my_table

CREATE TABLE IF NOT EXISTS my_table (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    age INTEGER,
    email VARCHAR(255),
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some sample data for testing
INSERT INTO my_table (name, age, email, active) VALUES
    ('John Doe', 30, 'john.doe@example.com', true),
    ('Jane Smith', 25, 'jane.smith@example.com', true),
    ('Bob Johnson', 35, 'bob.johnson@example.com', false),
    ('Alice Williams', 28, 'alice.williams@example.com', true);
