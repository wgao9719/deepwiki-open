# Use Python 3.11 as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install Node.js and npm
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    git \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements and install dependencies
COPY api/requirements.txt ./api/
RUN pip install --no-cache-dir -r api/requirements.txt

# Copy package.json and install Node.js dependencies
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Build the Next.js application
RUN NODE_ENV=production npm run build

# Expose the port the app runs on
EXPOSE 8001 3000

# Create a script to run both backend and frontend
RUN echo '#!/bin/bash\n\
# Load environment variables from .env file if it exists\n\
if [ -f .env ]; then\n\
  export $(grep -v "^#" .env | xargs)\n\
fi\n\
\n\
# Start the API server in the background\n\
python -m api.main &\n\
# Start the Next.js app\n\
npm run start\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set environment variables
ENV PORT=8001
ENV NODE_ENV=production

# Copy .env file if it exists
COPY .env ./

# Command to run the application
CMD ["/app/start.sh"]
