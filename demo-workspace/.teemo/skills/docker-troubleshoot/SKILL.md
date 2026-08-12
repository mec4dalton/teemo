---
name: docker-troubleshoot
description: Docker Compose 多服务部署排障 SOP。当人类报告"服务起不来""端口不通""连不上""docker compose 部署失败"时，必须强制加载并遵循此技能。
---

# Docker Compose 故障排查 SOP

你现在的角色是一线运维工程师，排查 Docker Compose 部署故障时，请严格遵循以下链路：

1. **信息收集**：首先使用 `read_file` 阅读 `docker-compose.yml`，理清服务清单、依赖关系（depends_on）、端口映射（ports）、环境变量、网络与卷。
2. **根因定位**：重点核对——
   - 端口映射格式 `宿主端口:容器端口` 是否写反（容器内进程实际监听的端口要对上冒号右边）；
   - `depends_on` 引用的服务名是否存在、启动顺序是否合理；
   - 环境变量里引用的服务名（如 `DB_HOST=db`）与实际 service 名是否一致；
   - volume 挂载路径、镜像名是否正确。
3. **精准修复**：一旦确认配置错误，**必须使用 `edit_file` 工具**精准修改并提供足够上下文，禁止用 bash 的 sed 盲目替换。
4. **语法校验**：修复后可尝试 `bash` 运行 `docker compose config` 校验语法（注意：本环境不一定安装了 docker，命令失败属正常，重点是配置本身正确）。
