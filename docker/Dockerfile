# Build frontend (Vite) in Node stage
FROM node:20-bookworm-slim AS frontend
WORKDIR /build
COPY spatialxgene/frontend/package*.json spatialxgene/frontend/
WORKDIR /build/spatialxgene/frontend
RUN npm ci
COPY spatialxgene/frontend/ .
RUN npm run build

# Runtime: Python + installed package with frontend dist
FROM python:3.10-slim-bookworm
WORKDIR /app
COPY pyproject.toml .
COPY spatialxgene/ spatialxgene/
COPY --from=frontend /build/spatialxgene/frontend/dist spatialxgene/frontend/dist
RUN pip install --no-cache-dir .

RUN mkdir -p /data
EXPOSE 5005
ENTRYPOINT ["spatialxgene", "launch", "--data-dir", "/data", "--host", "0.0.0.0", "--no-browser"]
