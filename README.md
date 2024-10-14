# Langflow with Next.js Sidecar

This repo contains code and config to allow you to run a Langflow server along with a Next.js server within a single Docker container.

## Getting Going

You need to have Node.js (tested with v20.18.0) and NPM (tested with v10.8.2) installed, as well as Docker or a Docker-compatible engine like Podman.

### Installing Node, NPM, and Docker

You can skip this section if you already have it installed!

#### Installing Node

Simplest thing is the installer at https://nodejs.org/en/download/package-manager , and for more options/details the instructions at https://docs.npmjs.com/downloading-and-installing-node-js-and-npm . The `v20.18.0` version above is the latest-at-time-of-writing LTS release of `v20`.

#### Instaling Docker

Docker can be installed from https://docs.docker.com/engine/install/ , you should likely look for the "Docker Desktop" links rather than installing onto a server (this was developed and tested with Docker Desktop).

Note there are commercial license considerations associated with running Docker; Podman https://podman.io/ is an open-source Docker-compatible alternative; there is a Podman Desktop available for download.

### Building
Once the necessary environment tools are installed, clone this repo, and within this directory:

```
mkdir data
mkdir data/uploads
mkdir data/langflow
npm run build
docker build -t langflow-with-nextjs-sidecar .
```

This will download and build the necessary components.

### Environment Setup
Copy the `.env.example` file into a file named `.env`; these environment variables will be used by the container:

```
cp .env.example .env
```

1. Edit this to include additional environment variables.
   * To run the sample `upload-files` page, you'll need an DataStax Astra database and token as well as an OpenAI API key.
   * You can alternatively modify the flows to suit your particular needs.
2. Review the `LANGFLOW_WORKERS` value; the higher this value, the more concurrent requests Langflow can process.

### Running the Environment

Depending if you are in a Unix-like environment:
```bash
docker run -d -p 7860:7860 -p 3000:3000 -v "$(pwd)/data/langflow:/data-langflow" -v "$(pwd)/data/uploads:/data-uploads" --env-file .env langflow-with-nextjs-sidecar
```

or Windows PowerShell:
```powershell
docker run -d -p 7860:7860 -p 3000:3000 -v "${pwd}\data\langflow:/data-langflow" -v "${pwd}\data\uploads:/data-uploads" --env-file .env langflow-with-nextjs-sidecar
```

This will start the container. One the container's log, you'll eventually see something like this:

```
> langflow-with-nextjs-sidecar@0.1.0 start
> next start

  ▲ Next.js 14.2.15
  - Local:        http://localhost:3000

 ✓ Starting...
 ✓ Ready in 3.9s
Starting Langflow v1.0.18...
╭───────────────────────────────────────────────────────────────────╮
│ Welcome to ⛓ Langflow                                             │
│                                                                   │
│                                                                   │
│ A new version of Langflow is available: 1.0.19                    │
│                                                                   │
│ Run 'pip install Langflow -U' to update.                          │
│                                                                   │
│ Collaborate, and contribute at our GitHub Repo 🌟                 │
│                                                                   │
│ We collect anonymous usage data to improve Langflow.              │
│ You can opt-out by setting DO_NOT_TRACK=true in your environment. │
│                                                                   │
│ Access http://0.0.0.0:7860                                        │
╰───────────────────────────────────────────────────────────────────╯
```

in which case you are ready to go.

### Accessing Applications

If you've not modified the ports on the `docker` command above:

* Langflow is at [http://localhost:7860](http://localhost:7860)
* Example File Upload page is at [http://localhost:3000/upload-files](http://localhost:3000/upload-files), but you first need to load the sample flows!

### Sample Flows

In the `flows` directory are some `.json` files you can import into Langflow. Once you import `Server File Loader.json`, the `upload-files` page should work.

## Adding to Next.js Application

### Environment Setup

Make a copy of `.env`:

```
cp .env .env.local
```

And edit that file. Most importantly for the `upload-files` page is to add a line:

```
LOCAL_FILE_UPLOAD_DIRECTORY=./data/uploads
```

As this will allow the Node application running outside of the container to upload files to a location accessible to the development Next.js application in the same place as the Langflow container expects to find them.
