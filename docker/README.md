# 容器化部署 (Docker & Singularity)

本项目提供 Docker 与 Singularity 两种容器化部署方式，主要用于解决不同操作系统（如 CentOS 7）下的 **glibc 版本兼容性** 问题。

**重要提示：** 预构建的 Docker/Singularity 镜像主要用于 **`spatialxgene launch` 可视化分析**，并不包含 `preprocess` 或 `visium2h5ad` 等预处理功能。请在现代开发机上完成预处理（`.h5ad` 生成）后，再将数据挂载到镜像中查看。

## 使用场景建议

| 方式 | 建议场景 | 特点 |
| :--- | :--- | :--- |
| **Docker Compose** | 网站服务器、长期运行的服务。 | 支持自动重启、多容器协同（如 Nginx 反代）、管理方便。 |
| **Singularity (Apptainer)** | 超算集群 (HPC)、开发机快速查看、无 root 权限环境。 | **单文件 (.sif)** 分发、无 root 权限运行、完美适配 CentOS 7 等老旧 glibc 环境。 |

---

## 1. Docker Compose (长期服务)

1. **加载镜像**（以 0.2.6 版本为例）：
   ```bash
   docker load -i spatialxgene-0.2.6.tar
   ```

2. **配置 `docker-compose.yml`**：
   在服务器上，你需要根据实际环境修改 `docker/docker-compose.yml`。**关键点**是使用已加载的镜像并挂载真实的数据路径：

   ```yaml
   services:
     spatialxgene:
       image: spatialxgene:latest
       # 注意：在服务器上请注释掉 build 块，直接使用上面加载的 image
       # build:
       #   context: ..
       #   dockerfile: docker/Dockerfile
       ports:
         - "5005:5005"
       volumes:
         - /你的/宿主机/数据目录:/data  # 修改为真实的 h5ad 存放路径
       environment:
         - SPATIALXGENE_API_BASE=spatialxgene # 如果使用了 Nginx 子路径反代
       command: ["--token", "${SPATIALXGENE_TOKEN:-}", "--api-base", "spatialxgene"]
   ```

3. **启动服务**：
   ```bash
   docker compose up -d
   ```

4. **访问示例**：
   如果配置了 Nginx 反代（路径为 `/spatialxgene/`）并启用了 Token，访问地址如下：
   `https://your-domain.com/spatialxgene/?token=YOUR_TOKEN`

---

## 2. Singularity (超算/集群快速查看)

在 CentOS 7 等老旧系统上，Singularity 是解决 glibc 报错的最佳方案。

1. **运行 SIF 镜像**（以 0.2.6 版本为例）：
   ```bash
   # --bind 挂载宿主机数据目录到容器内 /data
   # 使用 --token 设置访问令牌（示例值请替换）
   singularity run --bind /path/to/your/h5ad:/data spatialxgene-0.2.6.sif --token YOUR_TOKEN
   ```

2. **常用参数**：
   - `--token`: 设置访问令牌（如 `--token ""` 禁用）。
   - `--port`: 修改监听端口。
   - `--host`: 修改监听地址（默认 0.0.0.0）。
   - `--no-browser`: 禁用自动打开浏览器（服务器环境必需）。

---

## 本地子路径测试 (Docker)

(此部分仅供开发者测试使用)
```bash
docker compose -f docker/docker-compose.nginx-test.yml up --build
```
打开 http://localhost:8888/spatialxgene/ 即可查看模拟子路径部署的效果。
