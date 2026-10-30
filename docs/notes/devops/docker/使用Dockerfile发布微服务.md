---
title: 使用Dockerfile发布微服务
createTime: 2025/03/30 21:54:25
permalink: /devops/deploy/jar/
---

搭建一个普通的springboot工程，并使用maven构建、打包好一个待发布的jar包，将jar包上传到待发布的服务器。

### 编写Dockerfile

```shell
FROM openjdk:8-oracle
MAINTAINER yyj

# 在主机 /var/lib/docker目录下创建一个临时文件，并链接到容器的 /tmp
VOLUME /tmp

# 将jar包添加到容器中，并命名为 springboot_docker.jar
ADD docker_boot-1.0-SNAPSHOT.jar /springboot_docker.jar
# 运行jar包
RUN bash -c 'touch /springboot_docker.jar'
ENTRYPOINT ["java", "-jar", "/springboot_docker.jar"]

# SpringBoot项目配置的端口号为6001，需要将6001暴露出去
EXPOSE 6001
```

### 构建镜像

```shell
docker build -t springboot_docker:1.0 .
```

### 启动容器

```shell
docker run -d -p 6001:6001 --name springboot springboot_docker:1.0
```

访问服务测试服务是否正常运行