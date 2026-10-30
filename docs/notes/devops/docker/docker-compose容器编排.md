---
title: docker-compose容器编排
createTime: 2025/04/01 22:35:24
permalink: /devops/docker/compose/
---

### 介绍：

由Docker 官方推出的一个工具软件，用来管理多个 Docker 容器组成一个完整应用。你需要定义一个 YAML 格式的配置文件docker-compose.yml，写好多个容器之间的依赖关系。然后只要一个命令，就能同时启动/关闭这些容器。

 docker建议我们每一个容器中只运行一个服务,因为docker容器本身占用资源极少,所以最好是将每个服务单独的分割开来，但如果需要同时部署好多个服务，且服务之前存在依赖关系，久而久之，服务的维护变得错综复杂，所以docker官方为我们提供了docker-compose工具来管理和部署多个服务，docker compose允许用户通过一个单独的docker-compose.yml模板文件（YAML 格式）来定义一组相关联的应用容器为一个项目（project），可以轻松的使用一个配置文件定义一个多容器的应用，然后使用一条指令安装这个应用的所有依赖，完成构建。Docker-Compose 解决了容器与容器之间如何管理编排的问题。

官方文档：https://docs.docker.com/compose/compose-file/compose-file-v3/

下载地址：https://docs.docker.com/compose/install/

安装步骤：

```shell
# 下载docker-compose
curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# 赋予执行权限
chmod +x /usr/local/bin/docker-compose

# 查看版本号
docker-compose --version

# 卸载（删除docker-compose文件夹）
sudo rm usr/local/bin/docker-compose
```

### 核心概念

核心文件：docker-compose.yml

服务（service）：一个个的应用容器实例。

 工程（project）：由一组关联的应用容器组成的一个完整业务单元，在 docker-compose.yml 文件中定义。

使用步骤：

1. 编写Dockerfile定义各个微服务应用并构建出对应的镜像文件。
2. 定义一个完整业务单元，安排好整体应用中的各个容器服务。
3. 最后，执行docker-compose up命令 来启动并运行整个应用程序，完成一键部署。

### 常用命令

```shell

# 查看帮助
docker-compose -h

# 启动所有docker-compose服务
docker-compose up                           

# 启动所有docker-compose服务并后台运行
docker-compose up -d

# 停止并删除容器、网络、卷、镜像。
docker-compose down

# 重新构建并启动指定服务
docker-compose up -d --build <service_name>‘

# 启动服务时，不启动其依赖的服务
docker-compose up -d --no-deps <service_name>

# 进入容器实例内部  docker-compose exec docker-compose.yml文件中写的服务id /bin/bash
docker-compose exec  [yml里面的服务id]

# 展示当前docker-compose编排过的运行的所有容器
docker-compose ps

# 展示当前docker-compose编排过的容器进程
docker-compose top

# 查看容器输出日志
docker-compose logs  [yml里面的服务id]

# 检查配置
docker-compose config

# # 检查配置，有问题才有输出
docker-compose config -q

# 重启服务
docker-compose restart

# 启动服务
docker-compose start

# 停止服务
docker-compose stop
```

说明：

docker-compose编排的是一组微服务，若重启某个服务，其他服务也被重启会带来不必要的停机时间，机制：Docker Compose 默认会检查 `docker-compose.yml` 的配置变更，如果发现任何服务的配置（如镜像版本、环境变量、端口映射等）发生变化，会自动重新创建该服务的容器。

### docker-compose容器编排案例

准备一个微服务工程，该工程依赖mysql、redis，使用maven构建打包并将jar上传到服务器，使用Dockerfile构建为docker镜像。

编写文件docker-compose.yaml文件：

```yaml
# docker-compose文件版本号
version: "3"

# 配置各个容器服务
services:
  microService:
    image: springboot_docker:1.0
    container_name: ms01  # 容器名称，如果不指定，会生成一个服务名加上前缀的容器名
    ports:
      - "6001:6001"
    volumes:
      - /app/microService:/data
    networks:
      - springboot_network
    depends_on:  # 配置该容器服务所依赖的容器服务
      - redis
      - mysql

  redis:
    image: redis:6.0.8
    ports:
      - "6379:6379"
    volumes:
      - /app/redis/redis.conf:/etc/redis/redis.conf
      - /app/redis/data:data
    networks:
      - springboot_network
    command: redis-server /etc/redis/redis.conf

  mysql:
    image: mysql:5.7
    environment:
      MYSQL_ROOT_PASSWORD: '123456'
      MYSQL_ALLOW_EMPTY_PASSWORD: 'no'
      MYSQL_DATABASE: 'db_springboot'
      MYSQL_USER: 'springboot'
      MYSQL_PASSWORD: 'springboot'
    ports:
      - "3306:3306"
    volumes:
      - /app/mysql/db:/var/lib/mysql
      - /app/mysql/conf/my.cnf:/etc/my.cnf
      - /app/mysql/init:/docker-entrypoint-initdb.d
    networks:
      - springboot_network
    command: --default-authentication-plugin=mysql_native_password # 解决外部无法访问

networks:
  # 创建 springboot_network 网桥网络
  springboot_network:
```

说明：容器间的通信，使用的同一个网卡springboot_network，可以直接把访问的host修改为服务名。如：

```java
spring.redis.host=redis
spring.datasource.url=jdbc:mysql://mysql:3306/db_springboot?useUnicode=true&characterEncoding=utf-8&useSSL=false
```

检查docker-compose.yaml文件语法格式是否正确：

```shell
# 进行语法检查
docker-compose config -q
```

检查无误后直接启动：

```shell
docker-compose up -d
```





