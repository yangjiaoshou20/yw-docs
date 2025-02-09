---
title: docker常用命令
createTime: 2025/02/09 21:22:59
permalink: /devops/docker/command/
---

### 帮助及启动类命令

```shell
# 启动docker
systemctl start docker
# 停止Docker
systemctl stop docker
# 重启docker
systemctl restart docker
# 查看docker状态
systemctl status docker
# 设置开机启动
systemctl enable docker
# 查看docker概要信息
docker info
# 查看docker总体帮助文档
 docker --help
# 查看docker命令帮助文档
docker [具体命令] --help
```

### 镜像命令

#### 列出本地镜像：

```shell
docker images [OPTIONS] 
```

OPTIONS说明：

-a :列出本地所有的镜像（含历史映像层）

-q :只显示镜像ID。

#### 搜索镜像：

```shell
docker search [OPTIONS] [镜像名称]
```

OPTIONS说明：

--limit : 列出N个镜像，默认25个

```shell
docker search --limit 5 redis
```

#### 下载镜像：

```shell
docker pull [镜像名称]:[TAG]
```

说明：

没有TAG默认为最新版本，等价于docker pull [镜像名字]:latest

查看镜像/容器/数据卷所占的空间:

```shell
docker system df
```

#### 删除镜像：

单个：

```shell
docker rmi  -f [镜像ID]
```

多个：

```shell
docker rmi -f 镜像名1:TAG 镜像名2:TAG 
```

全部：

```shell
docker rmi -f $(docker images -qa)
```

#### 虚悬镜像：

仓库名、标签都是\<none>的镜像，俗称虚悬镜像dangling image

### 容器命令