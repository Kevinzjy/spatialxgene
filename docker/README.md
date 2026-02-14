# Docker 部署

## 服务器上的用法（你当前流程）

1. **本机**：构建并打包镜像，上传到服务器。
   ```bash
   # 在项目根目录
   docker build -f docker/Dockerfile -t spatialxgene:latest .
   docker save -o spatialxgene.tar spatialxgene:latest
   # 把 spatialxgene.tar 拷到服务器
   ```

2. **服务器**：加载镜像，在放有 `docker-compose.yml` 的目录（如 `docker/`）里起服务。
   ```bash
   docker load -i spatialxgene.tar
   cd docker
   docker compose up -d
   ```

3. **docker-compose.yml 示例**（只保留你需要的部分即可）：
   ```yaml
   services:
     spatialxgene:
       image: spatialxgene:latest
       ports:
         - "5005:5005"
       volumes:
         - /path/on/host/to/h5ad:/data
       command: ["--token", "zhaoslab", "--api-base", "spatialxgene"]
   ```
   - 若 nginx 反代路径不是 `/spatialxgene/`，把 `--api-base` 改成对应路径名。
   - 数据目录：宿主机路径挂载到容器内 `/data`；仓库内默认用 `../tests/h5ad`（见 docker-compose.yml）。容器会递归扫描该目录及子目录下的所有 `.h5ad`；文件名中含多个点（如 `sample_v1.3.h5ad`）也支持。

---

## 本地一键测子路径（可选）

在项目根目录执行：

```bash
docker compose -f docker/docker-compose.nginx-test.yml up --build
```

浏览器打开 http://localhost:8888/spatialxgene/ 。数据目录为 `./tests/h5ad`。
