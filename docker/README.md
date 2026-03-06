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

2. **启动服务**：
   在 `docker/` 目录下（确保已有 `docker-compose.yml`）：
   ```bash
   docker compose up -d
   ```

3. **配置说明**：
   - 默认映射端口 `5005`。
   - 默认数据挂载 `./tests/h5ad` 到容器内 `/data`，请根据实际情况在 `docker-compose.yml` 中修改 `volumes`。

---

## 2. Singularity (超算/集群快速查看)

在 CentOS 7 等老旧系统上，Singularity 是解决 glibc 报错的最佳方案。

1. **运行 SIF 镜像**（以 0.2.6 版本为例）：
   ```bash
   # --bind 挂载宿主机数据目录到容器内 /data
   # 使用 --token 设置访问令牌（默认 zhaoslab）
   singularity run --bind /path/to/your/h5ad:/data spatialxgene-0.2.6.sif --token zhaoslab
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
