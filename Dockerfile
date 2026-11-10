# Stage 1: Build WebAssembly cutting engine and web assets
FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add wasm32-unknown-unknown
RUN curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install.sh | bash \
    && cargo binstall -y --force wasm-pack

WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY web ./web

WORKDIR /build/web
RUN npm ci || npm install
RUN npm run build

# Stage 2: Serve with lightweight Nginx (~25MB total image size)
FROM nginx:alpine
LABEL org.opencontainers.image.title="Pilina"
LABEL org.opencontainers.image.description="Cut plans, step-by-step sawing, and automatic offcut management for sheet goods"
LABEL org.opencontainers.image.source="https://github.com/grafffooo/pilina"

COPY --from=builder /build/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
