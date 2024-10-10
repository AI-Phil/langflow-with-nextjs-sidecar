# Start from the Langflow image
FROM langflowai/langflow:1.0.18

# Switch to the root user to have the necessary permissions for installing packages
USER root

# Install Node.js 20.18.0
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs=20.18.0-1nodesource1

# Switch back to the user
USER user

# Set up the Next.js app directory with the correct user
WORKDIR /app/nextjs

# Copy the Next.js build output from your local machine
COPY .next ./.next
COPY public ./public
COPY package.json ./package.json

# Install production dependencies for Next.js (like `next` and `react`)
RUN npm install --omit=dev

# Change the working directory back to /app to ensure compatibility with Langflow
WORKDIR /app

# Expose the ports for Langflow and Next.js
EXPOSE 7860
EXPOSE 3000

# Start both Langflow and the Next.js server
CMD ["sh", "-c", "python -m langflow run & npm run start --prefix /app/nextjs"]
