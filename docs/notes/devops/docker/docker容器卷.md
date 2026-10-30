---
title: docker容器卷
createTime: 2025/03/11 22:18:27
permalink: /devops/volumes/
---

### docker数据卷

#### 基本介绍：

就是目录或文件，存在于一个或多个容器中，由docker挂载到容器，但不属于联合文件系统，因此能够绕过Union File System提供一些用于持续存储或共享数据的特性。卷的设计目的就是数据的持久化，将docker容器内的数据保存进宿主机的磁盘中，完全独立于容器的生命周期，因此Docker不会在容器删除时删除其挂载的数据卷。

#### 背景：

将应用与运行的环境打包为镜像，run后形成容器实例运行，但是我们对应用产生的数据要求是持久化的。Docker容器产生的数据，如果不备份，那么当容器实例删除后，容器内的数据也随之删除。为了能持久化在docker中产生的数据我们使用卷来挂在容器中的目录或文件。

#### 特点：

1、数据卷可在容器之间共享或重用数据

2、卷中的更改可以直接实时生效

3、数据卷中的更改不会包含在镜像的更新中

4、数据卷的生命周期一直持续到没有容器使用它为止

#### 使用：

```shell
 docker run -it --privileged=true -v [/宿主机绝对路径目录]:[/容器内目录] [镜像名]
```

#### 说明：

--privileged=true：

异常情况：Docker挂载主机目录访问如果出现cannot open directory .: Permission denied

解决办法：在挂载目录后多加一个--privileged=true参数即可

原因：CentOS7安全模块会比之前系统版本加强，不安全的会先禁止，所以目录挂载的情况被默认为不安全的行为，在SELinux里面挂载目录默认是被禁止的，如果要开启，我们一般使用--privileged=true命令，扩大容器的权限解决挂载目录没有权限的问题，也即使用该参数，container内的root拥有真正的root权限，否则，container内的root只是外部的一个普通用户权限。

#### 使用案例：

宿主机和容器间映射添加容器卷：

```shell
docker run -it --name my_ubuntu --privileged=true -v /tmp/myHostData:/tmp/myDockerData ubuntu /bin/bash
```

查看目录挂在是否正常：

```shell
docker inspect [容器ID]
```

查看Mounts信息，查看目录挂载情况。

测试数据共享：

1、在容器中修改文件内容，宿主机立即生效

2、宿主机上修改文件内容，容器中立即生效

3、停止容器，宿主机修改文件内容，容器再次启动，文件内容正常同步

#### 数据卷的读写规则：

读写（默认）：

```shell
 docker run -it --privileged=true -v /宿主机绝对路径目录:/容器内目录:rw [镜像名]
```

不写默认即是可读可写。

只读（ro）：

容器实例内部被限制，只能读取不能写

```shell
 docker run -it --privileged=true -v /宿主机绝对路径目录:/容器内目录:ro [镜像名]
```

#### 数据卷的继承和共享：

```shell
docker run -it  --privileged=true --volumes-from [父容器]  --name u2 ubuntu
```

说明：容器卷继承后与原容器的数据卷映射互不影响，及时原来容器删除也不会影响当前容器与宿主机目录映射。





