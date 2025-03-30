---
title: DockerFile使用
createTime: 2025/03/28 07:13:58
permalink: /devops/docker/dockerfile/
---

### DockerFile简介

Dockerfile是用来构建Docker镜像的文本文件，是由一条条构建镜像所需的指令和参数构成的脚本。

官方网站：https://docs.docker.com/engine/reference/builder/

构建步骤：

1. 编写Dockerfile文件
2. build命令构建镜像
3. docker run依镜像运行容器实例

DockerFile使用说明：

- 每条保留字指令都必须为大写字母且后面要跟随至少一个参数
- 指令按照从上到下，顺序执行
- \#表示注释
- 每条指令都会创建一个新的镜像层并对镜像进行提交

Docker执行Dockerfile的大致流程：

1. docker从基础镜像运行一个容器
2. 执行一条指令并对容器作出修改
3. 执行类似docker commit的操作提交一个新的镜像层
4. docker再基于刚提交的镜像运行一个新容器
5. 执行dockerfile中的下一条指令直到所有指令都执行完成

### DockerFile中的保留字

```shell
# 基础镜像，当前新镜像是基于哪个镜像的，指定一个已经存在的镜像作为模板，第一条必须是from
# FROM hub.c.163.com/library/tomcat
FROM

# 镜像维护者的姓名和邮箱地址(非必须)
# MAINTAINER yyj yyj@163.com
MAINTAINER

# 容器构建时需要运行的命令
# shell格式：RUN <命令行命令> 等同于在终端操作的shell命令
# RUN yum -y install vim
# exec格式：RUN ["可执行文件" , "参数1", "参数2"]
# RUN ["./test.php", "dev", "offline"]  # 等价于 RUN ./test.php dev offline
# 执行时机：在docker build时运行
RUN

# 当前容器对外暴露出的端口
# EXPOSE 3306 33060
EXPOSE

# 指定在创建容器后， 终端默认登录进来的工作目录
# ENV CATALINA_HOME /usr/local/tomcat
# WORKDIR $CATALINA_HOME
WORKDIR

# 指定该镜像以什么样的用户去执行，若不指定，默认是root。（一般不修改该配置）
# USER <user>[:<group>]
USER

# 用来在构建镜像过程中设置环境变量,这个环境变量可以在后续的任何RUN指令或其他指令中使用
# ENV MY_PATH /usr/mytest
# WORKDIR $MY_PATH
ENV

# 容器数据卷，用于数据保存和持久化工作。类似于 docker run 的-v参数
# VOLUME /var/lib/mysql
VOLUME

# 将宿主机目录下（或远程文件）的文件拷贝进镜像，且会自动处理URL和解压tar压缩包。
ADD

# 类似ADD，拷贝文件和目录到镜像中,将从构建上下文目录中<源路径>的文件目录复制到新的一层镜像内的<目标路径>位置。
COPY src dest
COPY ["src", "dest"]
# <src源路径>：源文件或者源目录
# <dest目标路径>：容器内的指定路径，该路径不用事先建好。如果不存在会自动创建

# 指定容器启动后要干的事情
# shell格式:CMD <命令> CMD echo "hello world"
# exec格式:CMD ["可执行文件", "参数1", "参数2" ...] CMD ["catalina.sh", "run"]
# 参数列表格式:CMD ["参数1", "参数2" ....]，与ENTRYPOINT指令配合使用
# 说明：Dockerfile中如果出现多个CMD指令，只有最后一个生效。CMD会被docker run之后的参数替换
# docker run -it -p 8080:8080 tomcat
# 因为tomcat的Dockerfile中指定了 CMD ["catalina.sh", "run"],所以直接docker run 时，容器启动后会自动执行 catalina.sh run
# docker run -it -p 8080:8080 tomcat /bin/bash
# 指定容器启动后执行 /bin/bash,此时指定的/bin/bash会覆盖掉Dockerfile中指定的CMD["catalina.sh", "run"]，tomcat容器不会正常运行
# CMD是在docker run时运行，而 RUN是在docker build时运行
CMD

# 用来指定一个容器启动时要运行的命令
# 说明：类似于CMD命令，但是ENTRYPOINT不会被docker run后面的命令覆盖，这些命令参数会被当做参数送给ENTRYPOINT指令指定的程序，ENTRYPOINT可以和CMD一起用，一般是可变参数才会使用CMD，这里的CMD等于是在给ENTRYPOINT传参，当指定了ENTRYPOINT后，CMD的含义就发生了变化，不再是直接运行期命令，而是将CMD的内容作为参数传递给ENTRYPOINT指令，它们两个组合会变成 <ENTRYPOINT> "<CMD>"
# 例如：
FROM nginx
ENTRYPOINT ["nginx", "-c"]  # 定参
CMD ["/etc/nginx/nginx.conf"] # 变参
ENTRYPOINT
# docker run nginx test：容器启动后，会执行 nginx -c /etc/nginx/nginx.conf
# docker run nginx:test /app/nginx/new.conf：容器启动后，会执行 nginx -c /app/nginx/new.conf
```

### Dockerfile构建镜像

使用Dockerfile构建镜像并安装VIM、网络工具、jdk8

```shell
FROM centos
MAINTAINER yyj<yyj@163.com>
 
ENV MYPATH /usr/local
WORKDIR $MYPATH
 
#安装vim编辑器
RUN yum -y install vim
#安装ifconfig命令查看网络IP
RUN yum -y install net-tools
#安装java8及lib库
RUN yum -y install glibc.i686
RUN mkdir /usr/local/java
#ADD 是相对路径jar,把jdk-8u171-linux-x64.tar.gz添加到容器中,安装包必须要和Dockerfile文件在同一位置
ADD jdk-8u171-linux-x64.tar.gz /usr/local/java/
#配置java环境变量
ENV JAVA_HOME /usr/local/java/jdk1.8.0_171
ENV JRE_HOME $JAVA_HOME/jre
ENV CLASSPATH $JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar:$JRE_HOME/lib:$CLASSPATH
ENV PATH $JAVA_HOME/bin:$PATH
 
EXPOSE 80
 
CMD echo $MYPATH
CMD echo "success!"
CMD /bin/bash
```

构建镜像

```shell
docker build -t centos_java8:1.5 .
```

查看镜像是否构建完成，并启动容器

```shell
docker run -it centos_java8:1.5 /bin/bash
```

### 虚悬镜像

仓库名、标签都是\<none\>的镜像，俗称dangling image

手动构建虚悬镜像

```shell
# 构建时候没有镜像名、tag
docker build .
```

虚悬镜像一般是因为一些错误而出现的，没有存在价值，可以删除：

```shell
# 删除所有的虚悬镜像
docker image prune
```

