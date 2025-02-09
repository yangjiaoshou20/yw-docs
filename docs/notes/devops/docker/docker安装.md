---
title: docker安装
createTime: 2025/01/25 02:04:35
permalink: /devops/docker/install/
---

### 1、docker官网（centos7安装）

```json
https://docs.docker.com/engine/install/centos/
```

确认centos版本在7以上

```shell
cat /etc/redhat-release
```

### 2、卸载旧版本

```shell
sudo dnf remove docker \
                  docker-client \
                  docker-client-latest \
                  docker-common \
                  docker-latest \
                  docker-latest-logrotate \
                  docker-logrotate \
                  docker-engine
```

### 3、yum安装相关依赖

```shell
# 安装gcc相关依赖
yum -y install gcc
yum -y install gcc-c++
```

### 4、设置stable镜像仓库

```shell
# 配置yum资源库
# yum-util提供yum-config-manager功能 
sudo yum install -y yum-utils

# 配置docker的资源库地址，在yum资源库中添加docker资源库
# 官方地址(国外地址速度较慢不推荐)
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
# 阿里云镜像地址(推荐)
sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
```

### 5、更新yum软件包索引

创建软件包缓存

```shell
yum makecache fast
```

### 6、安装DOCKER CE

```shell
# 默认安装的docker引擎、客户端都是最新版本
yum -y install docker-ce docker-ce-cli containerd.io
```

安装指定版本：

```shell
# 查询版本列表
yum list docker-ce --showduplicates | sort -r

# 指定版本安装17.09.0.ce版
# sudo yum install docker-ce-<VERSION_STRING> docker-ce-cli-<VERSION_STRING> containerd.io docker-compose-plugin
sudo yum install docker-ce-17.09.0.ce docker-ce-cli-17.09.0.ce containerd.io docker-compose-plugin
```

### 7、启动docker

```shell
systemctl start docker
```

### 8、验证安装是否成功

```shell
docker version
```

或者

```shell
docker run hello-world
```

### 9、卸载

```shell
# 关闭服务 
systemctl stop docker
# 使用yum删除docker引擎 
yum remove docker-ce docker-ce-cli containerd.io
# 删除镜像、容器、卷、自定义配置等文件 
rm -rf /var/lib/docker
rm -rf /var/lib/containerd
```

### 10、配置阿里云镜像加速器

登录阿里云-->控制台-->容器镜像服务-->镜像工具-->镜像加速器

```json
https://cr.console.aliyun.com/cn-hangzhou/instances/mirrors
```

选择centOS版本：

通过修改daemon配置文件/etc/docker/daemon.json来使用加速器

```shell
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": ["https://ocqzxg9u.mirror.aliyuncs.com"]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

