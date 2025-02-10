---
title: docker容器命令
createTime: 2025/02/10 22:31:10
permalink: /devops/container/command/
---

### 新建并启动容器

启动命令结构：

```
docker run [OPTIONS] IMAGE [COMMAND] [ARG...]
```

常用参数：

- `--name`：为容器指定一个名称


- `-d`：后台运行容器并返回容器ID，也即启动守护式容器


- `-i`：以交互模式（interactive）运行容器，通常与`-t`同时使用


- `-t`：为容器重新分配一个伪输入终端（tty），通常与`-i`同时使用。也即启动交互式容器（前台有伪终端，等待交互）


- `-e`：为容器添加环境变量


- `-P`：随机端口映射。将容器内暴露的所有端口映射到宿主机随机端口


- `-p`：指定端口映射

`-p`指定端口映射的几种不同形式：

- `-p hostPort:containerPort`：端口映射，例如`-p 8080:80`


- `-p ip:hostPort:containerPort`：配置监听地址，例如 `-p 10.0.0.1:8080:80`


- `-p ip::containerPort`：随机分配端口，例如 `-p 10.0.0.1::80`


- `-p hostPort1:containerPort1 -p hostPort2:containerPort2`：指定多个端口映射，例如`-p 8080:80 -p 8888:3306`

### 启动交互式容器

以交互方式启动ubuntu镜像

```shell
# -i 交互模式
# -t 分配一个伪输入终端tty
# ubuntu 镜像名称
# /bin/bash（或者bash） shell交互的接口
docker run -it ubuntu /bin/bash	
```

### 当前所有正在运行的容器：

```shell
docker ps [OPTIONS]
```

OPTIONS说明（常用）：

```shell
-a :列出当前所有正在运行的容器+历史上运行过的

-l :显示最近创建的容器。

-n：显示最近n个创建的容器。

-q :静默模式，只显示容器编号。
```

### 退出容器：

方式一：

```shell
# run进去容器，exit退出，容器停止
exit
```

方式二：

```shell
# run进去容器，ctrl+p+q退出，容器不停止
ctrl+p+q
```

### 常用容器操作：

```shell
# 启动已停止运行的容器
docker start [容器ID或者容器名]
# 重启容器
docker restart [容器ID或者容器名]
# 停止容器
docker stop [容器ID或者容器名]
# 强制停止容器
docker kill [容器ID或容器名]
# 删除已停止的容器
docker rm [容器ID]
# 删除多个容器实例
docker rm -f $(docker ps -a -q)
docker ps -a -q | xargs docker rm
```



