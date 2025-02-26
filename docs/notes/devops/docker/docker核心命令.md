---
title: docker核心命令
createTime: 2025/02/15 20:52:57
permalink: /devops/docker/core/
---

### 启动守护式容器

说明：

使用镜像centos:latest以后台模式启动一个容器：

```shell
docker run -d centos
```

**问题：**

启动之后使用docker ps -a 进行查看, 会发现容器已经退出。

**原因：**

Docker容器后台运行。就必须有一个前台进程。
容器运行的命令如果不是那些一直挂起的命令（比如运行top，tail），就是会自动退出的。

**说明：**

这个是docker的机制问题，比如你的web容器，我们以nginx为例，正常情况下,我们配置启动服务只需要启动响应的service即可。例如service nginx start但是，这样做,nginx为后台进程模式运行,就导致docker前台没有运行的应用，这样的容器后台启动后会立即自杀，因为它觉得它没事可做了。
所以，最佳的解决方案是,将你要运行的程序以前台进程的形式运行，常见就是命令行模式，表示我还有交互操作无需中断。
大部分情况下，我们系统docker容器服务时在后台运行的，可以通过`-d`指定容器的后台运行模式：

```shell
docker run -d [容器名]
```
示例：

以redis为例：

前台交互式启动:

```shell
 docker run -it redis:6.0.8
```
后台守护式启动:
```shell
docker run -d redis:6.0.8
```

### 查看容器日志

```shell
docker logs [容器ID]
```

### 查看容器中运行的进程

```shell
docker top [容器ID]
```

### 查看容器内部细节

```shell
docker inspect [容器ID]
```

### 进入正在运行的容器并以命令行交互

```shell
docker exec -it [容器ID] /bin/bash
```

### 重新进入docker attach 容器ID

```shell
docker attach [容器ID]
```

#### 两种进入容器方式的区别：

attach 直接进入容器启动命令的终端，不会启动新的进程，用exit退出会导致容器的停止。

exec 是在今日容器中并打开新的终端，并且可以启动新的进程，用exit退出不会导致容器的停止。

正常情况下使用 docker exec 命令，因为退出容器终端，不会导致容器的停止。

如果有多个终端，都对同一个容器执行了 `docker attach`，就会出现类似投屏显示的效果。一个终端中输入输出的内容，在其他终端上也会同步的显示。

### 容器和宿主机文件之间的copy

容器-->宿主机

```shell
docker cp 容器ID:容器内路径 目的主机路径
```

宿主机-->容器

```shell
docker cp 主机路径 容器ID:容器内路径
```

### 容器的导入和导出

`export`：导出容器的内容流作为一个tar归档文件（对应`import`命令）；

`import`：从tar包中的内容创建一个新的文件系统再导入为镜像（对应`export`命令）；

```shell
# 导出
# docker export 容器ID > tar文件名
docker export abc > aaa.tar

# 导入
# cat tar文件 | docker import - 自定义镜像用户/自定义镜像名:自定义镜像版本号
cat aaa.tar | docker import - test/mytest:1.0.1
```

### 容器制作镜像

docker 启动一个镜像容器后， 可以在里面执行一些命令操作，然后使用`docker commit`将新的这个容器快照生成一个镜像。

```shell
docker commit -m="提交的描述信息" -a="作者" 容器ID 要创建的目标镜像名:[tag]
```

Docker挂载主机目录，可能会出现报错：`cannot open directory .: Perission denied`。

解决方案：在命令中加入参数 `--privileged=true`。

说明：CentOS7安全模块比之前系统版本加强，不安全的会先禁止，目录挂载的情况被默认为不安全的行为，在SELinux里面挂载目录被禁止掉了。如果要开启，一般使用 `--privileged=true`，扩大容器的权限解决挂载没有权限的问题。也即使用该参数，容器内的root才拥有真正的root权限，否则容器内的root只是外部的一个普通用户权限。

#### 案例

在纯净的ubuntu环境中安装vim编辑器之后将容器打包为镜像。

操作步骤：

1、从公网仓库中下载ubuntu镜像：

```shell
docker pull ubuntu
```

2、默认情况下纯净的ununtu容器中是不带vim编辑器的。

3、进入容器并安装vim编辑器:

```shell
# 进入容器
docker run -it ubuntu
# 安装vim
apt-get update
apt-get -y install vim
```

4、使用commit命令制作自己的镜像:

```shell
docker commit -m="add vim" -a="yyj" 5fxitwsxiff yyj/vim-ubuntu:1.0
```

5、测试基于新的镜像启动并进入容器运行vim命令。

