#!/bin/bash

# CiteSight Frontend Startup Script

echo "🚀 Starting CiteSight Frontend..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file..."
    cat > .env << EOL
VITE_API_URL=http://localhost:8000/api
EOL
fi

# Start the frontend development server
echo "✅ Starting frontend server..."
echo "🌐 Frontend will be available at http://localhost:5173"
echo "📔 API Documentation: http://localhost:8000/api/docs"
echo "Press Ctrl+C to stop the server"
echo "----------------------------------------"

npm run dev