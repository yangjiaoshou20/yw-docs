---
title: docker安装常用软件
createTime: 2025/03/16 20:19:08
permalink: /devops/common/soft/
---

## mysql安装(5.7版本)

### demo版本：

拉取镜像：

```shell
docker pull mysql:5.7
```

启动容器实例：

```shell
# 运行容器
docker run -p 3306:3306 -e MYSQL_ROOT_PASSWORD=123456 -d mysql:5.7
# 查看正在运行的容器
docker ps
# 进入指定容器
docker exec -it 容器ID /bin/bash
# 连接mysql服务测试是否正常
mysql -uroot -p
```

存在问题：

中文乱码：mysql容器默认的字符编码格式为latin1。

容器删除，mysql中的数据信息，log日志信息等数据丢失。

### 企业级安装：

启动容器指定容器卷的映射：

```shell
docker run -d -p 3306:3306 --privileged=true -v /app/mysql/log:/var/log/mysql -v /app/mysql/data:/var/lib/mysql -v /app/mysql/conf:/etc/mysql/conf.d -e MYSQL_ROOT_PASSWORD=root --name mysql mysql:5.7
```

在容器映射到宿主机的配置文件的目录下新建配置文件my.cnf：

```shell
[client]
default-character-set=utf8
[mysqld]
collation_server = utf8_general_ci
character_set_server = utf8
```

之后重启docker容器使配置文件生效：

```shell
docker restart mysql
```

至此单机版mysql就解决了字符编码问题，并将数据相关目录映射到了宿主机。

### 主从复制版：

mysql主服务器安装：

```shell
docker run -p 3307:3306 \
           --name mysql-master \
           --privileged=true \
           -v /app/mysql-master/log:/var/log/mysql \
           -v /app/mysql-master/data:/var/lib/mysql \
           -v /app/mysql-master/conf:/etc/mysql \
           -e MYSQL_ROOT_PASSWORD=root \
           -d mysql:5.7
```

进入`/app/mysql-master/conf`，新建`my.cnf`配置文件:

```shell
[mysqld]
## 设置server_id, 同一个局域网中需要唯一
server_id=101
## 指定不需要同步的数据库名称
binlog-ignore-db=mysql
## 开启二进制日志功能
log-bin=mall-mysql-bin
## 设置二进制日志使用内存大小（事务）
binlog_cache_size=1M
## 设置使用的二进制日志格式（mixed,statement,row）
binlog_format=mixed
## 二进制日志过期清理时间。默认值为0，表示不自动清理
expire_logs_days=7
## 跳过主从复制中遇到的所有错误或指定类型的错误，避免slave端复制中断
## 如：1062错误是指一些主键重复，1032错误是因为主从数据库数据不一致
slave_skip_errors=1062
```

参数说明：

log-bin：启用二进制日志（binary logging），并指定生成的二进制日志文件的基本名称，当前配置中`mall-mysql-slave1-bin` 是指定的前缀名，实际的日志文件名会在此基础上加上顺序编号和扩展名，例如 `mall-mysql-slave1-bin.000001`、`mall-mysql-slave1-bin.000002` 等。

binlog_cache_size：定义了为每个客户端连接分配的二进制日志缓存大小，这个缓存用于存储在事务过程中对数据库所做的更改（针对那些支持事务的存储引擎，如InnoDB），以便这些更改能够被有效地写入到二进制日志中。

binlog_format：MySQL数据库中用于设置二进制日志记录格式的一个选项。

STATEMENT：基于语句的日志记录（STATEMENT-based logging）：在这种模式下，MySQL仅记录导致数据变更的SQL语句。这种方式的优点是日志文件相对较小且容易阅读，适用于大多数更新操作。然而，在一些特定的情况下，比如使用了不确定函数（如UUID()）、触发器或存储过程等，仅记录语句可能导致从服务器上的数据与主服务器不一致。

ROW：这种模式记录的是实际受影响的数据行的变化。尽管这会导致日志文件变大，但它能够更准确地反映所有更改，特别是在上述提到的那些复杂场景中。

MIXED：mixed 模式允许MySQL自动选择最适合当前操作的日志记录方式，当MySQL判断某个操作使用基于语句的日志记录可能会导致不一致的问题时，它会自动转换为基于行的记录方式。这样既能够享受基于语句日志记录带来的效率优势，又能在必要时保证数据的一致性和准确性。

重启mysql主服务：

```shell
docker restart mysql-master
```

新建用于主从同步的用户：

```shell
# 进入mysql-master容器
docker exec -it mysql-master /bin/bash

# 使用root用户登录
mysql -uroot -p

# 创建数据同步用户
create user 'slave'@'%' identified by '123456';

# 授权
grant replication slave, replication client on *.* to 'slave'@'%';

# 刷新权限
flush privileges;
```

mysql从库安装：

```shell
docker run -p 3308:3306 \
           --name mysql-slave \
           --privileged=true \
           -v /app/mysql-slave/log:/var/log/mysql \
           -v /app/mysql-slave/data:/var/lib/mysql \
           -v /app/mysql-slave/conf:/etc/mysql \
           -e MYSQL_ROOT_PASSWORD=root \
           -d mysql:5.7
```

在/app/mysql-slave/conf下新增配置文件my.cnf并增加如下配置信息：

```mysql
[mysqld]
## 设置server_id, 同一个局域网内需要唯一
server_id=102
## 指定不需要同步的数据库名称
binlog-ignore-db=mysql
## 开启二进制日志功能，以备slave作为其它数据库实例的Master时使用
log-bin=mall-mysql-slave1-bin
## 设置二进制日志使用内存大小（事务）
binlog_cache_size=1M
## 设置使用的二进制日志格式（mixed,statement,row）
binlog_format=mixed
## 二进制日志过期清理时间。默认值为0，表示不自动清理
expire_logs_days=7
## 跳过主从复制中遇到的所有错误或指定类型的错误，避免slave端复制中断
## 如：1062错误是指一些主键重复，1032是因为主从数据库数据不一致
slave_skip_errors=1062
## relay_log配置中继日志
relay_log=mall-mysql-relay-bin
## log_slave_updates表示slave将复制事件写进自己的二进制日志
log_slave_updates=1
## slave设置只读（具有super权限的用户除外）
read_only=1
```

参数说明：

relay_log：配置MySQL从服务器（Slave）上的中继日志文件名称的设置，在MySQL主从复制架构中，主服务器上的数据变更会记录到二进制日志中，然后从服务器通过I/O线程连接到主服务器，并将主服务器的二进制日志读取过来存储在自己的中继日志文件中。之后，从服务器上的SQL线程会读取这些中继日志文件并将变更应用到本地数据库中。

log_slave_updates：MySQL复制配置中的一个参数，当这个参数被设置在从服务器上时，它指示从服务器记录通过复制从主服务器接收到并执行的更新操作到自己的二进制日志中。默认情况下，这个选项是关闭的（即值为0），这意味着从服务器不会记录这些从主服务器同步过来的更新。log_slave_updates=1 使得从服务器不仅能够接收来自主服务器的数据变更并应用这些变更，还能将同样的变更记录到自身的二进制日志中，从而扩展了MySQL复制架构的功能性和灵活性。不过需要注意的是，开启此选项可能会增加从服务器的磁盘I/O负载以及存储需求，因为需要额外的空间来保存二进制日志文件。因此，在启用之前应评估其对系统资源的影响。

重启从库：

```shell
docker restart mysql-slave
```

在主数据库中查看主从同步状态：

```shell
# 进入主库
docker exec -it mysql-master /bin/bash

mysql -uroot -p

# 查看主从同步状态
show master status;
```

主要查看返回结果的文件名`File`、当前位置`Position` 信息。

进入从库配置主从同步信息：

```shell
# 进入从库
docker exec -it mysql-slave /bin/bash
mysql -uroot -p
# 格式：
# change master to master_host='宿主机ip',master_user='主数据库配置的主从复制用户名',master_password='主数据库配置的主从复制用户密码',master_port=宿主机主数据库端口,master_log_file='主数据库主从同步状态的文件名File',master_log_pos=主数据库主从同步状态的Position,master_connect_retry=连接失败重试时间间隔（秒）;

change master to master_host='192.168.xxx.xxx',master_user='slave',master_password='123456',master_port=3307,master_log_file='mall-mysql-bin.000001',master_log_pos=769,master_connect_retry=30;
```

查看主从同步状态：

```shell
# \G 可以将横向的结果集表格转换成纵向展示。
# slave status的字段比较多，纵向展示比友好
show slave status \G;
```

除了展示刚刚配置的主数据库信息外，主要关注 `Slave_IO_Running`、`Slave_SQL_Running`。目前两个值应该都为 `No`，表示还没有开始。 

在从库中开启主从同步：

```shell
start slave;
```

再次查看主从同步状态，`Slave_IO_Running`、`Slave_SQL_Running`都变为`Yes`。 

测试主从同步效果：

```shell
# 在主库中新建库、新建表并插入数据
create database db01;
use db01;
create table t1 (id int, name varchar(20));
insert into t1 values (1, 'abc');
```

在从数据库上使用库、查看数据同步情况：

```shell
show databases;
use db01;
select * from t1;
```

## mysql安装(8.0版本)：

```shell
# 拉取镜像
docker pull mysql:8.0.25
# 创建主节点容器
docker run -p 16036:3306 --name mysql-master --privileged=true -v /app/mysql-master/log:/var/logs/mysql -v /app/mysql-master/data:/var/lib/mysql -v /app/mysql-master/conf:/etc/mysql -v /app/mysql-master/mysql-files:/var/lib/mysql-files -e MYSQL_ROOT_PASSWORD=yangyongjun -d mysql:8.0.25
```

修改配置文件：

```shell
vim /app/mysql-master/conf
# 编辑如下内容
[client]
default-character-set=utf8
[mysqld]
collation_server = utf8_general_ci
character_set_server = utf8
## 设置server_id, 同一个局域网中需要唯一
server_id=101
## 指定不需要同步的数据库名称
binlog-ignore-db=mysql
## 开启二进制日志功能
log-bin=mall-mysql-bin
## 设置二进制日志使用内存大小（事务）
binlog_cache_size=1M
## 设置使用的二进制日志格式（mixed,statement,row）
binlog_format=mixed
## 二进制日志过期清理时间。默认值为0，表示不自动清理
expire_logs_days=7
## 跳过主从复制中遇到的所有错误或指定类型的错误，避免slave端复制中断
## 如：1062错误是指一些主键重复，1032错误是因为主从数据库数据不一致
slave_skip_errors=1062
```

重启容器：

```shell
docker restart mysql-master
# 查看主从同步的主库状态
# mall-mysql-bin.000003	156		mysql	
show master status;
```

新建主库用户用户同步主库数据到从库：

```shell
# 创建数据同步用户
create user 'slave'@'%' identified by 'www.yyj.com';
# 授权
grant replication slave, replication client on *.* to 'slave'@'%';
# 刷新权限
flush privileges;
```

启动从库容器：

```shell
docker run -p 16037:3306 --name mysql-slave --privileged=true -v /app/mysql-slave/log:/var/logs/mysql -v /app/mysql-slave/data:/var/lib/mysql -v /app/mysql-slave/conf:/etc/mysql -v /app/mysql-slave/mysql-files:/var/lib/mysql-files -e MYSQL_ROOT_PASSWORD=www.yyj.com -d mysql:8.0.25
```

修改从库配置文件：

```shell
# 新增配置文件
vim /app/mysql-slave/conf/my.cnf
# 编辑如下内容
[client]
default-character-set=utf8
[mysqld]
collation_server = utf8_general_ci
character_set_server = utf8
## 设置server_id, 同一个局域网内需要唯一
server_id=102
## 指定不需要同步的数据库名称
binlog-ignore-db=mysql
## 开启二进制日志功能，以备slave作为其它数据库实例的Master时使用
log-bin=mall-mysql-slave1-bin
## 设置二进制日志使用内存大小（事务）
binlog_cache_size=1M
## 设置使用的二进制日志格式（mixed,statement,row）
binlog_format=mixed
## 二进制日志过期清理时间。默认值为0，表示不自动清理
expire_logs_days=7
## 跳过主从复制中遇到的所有错误或指定类型的错误，避免slave端复制中断
## 如：1062错误是指一些主键重复，1032是因为主从数据库数据不一致
slave_skip_errors=1062
## relay_log配置中继日志
relay_log=mall-mysql-relay-bin
## log_slave_updates表示slave将复制事件写进自己的二进制日志
log_slave_updates=1
## slave设置只读（具有super权限的用户除外）
read_only=1
```

主从数据同步开启：

```shell
docker restart mysql-slave
# 由于mysql默认使用的默认密码插件为Authentication plugin 'caching_sha2_password'需要先申请公钥
# 允许 RSA 公钥检索
CHANGE MASTER TO GET_MASTER_PUBLIC_KEY = 1;
# 开启主从同步其中master_log_file和master_log_pos参数根据主数据库状态查看修改
change master to master_host='192.168.211.132',master_user='slave',master_password='www.yyj.com',master_port=16036,master_log_file='mall-mysql-bin.000003',master_log_pos=156,master_connect_retry=30;
# 开始同步
start slave;
```

查看主从同步状态并验证：

```shell
show slave status;
```



## redis安装

### demo版本：

拉取redis镜像：

```shell
docker pull redis:6.0.8	
```

运行容器：

```shell
docker run -p 6379:6379 -d redis:6.0.8
```

问题：没有挂载数据卷，配置文件修改和数据随容器删除也被删除。

### 企业版本：

新建redis配置文件：

在/app/redis下新增redis.conf配置文件，并修改一下配置信息：

```shell
# 开启密码验证
requirepass 123

# 允许redis远程连接，需要注释掉绑定的IP
# bind 127.0.0.1

# 关闭保护模式（可选）
protected-mode no

# 注释掉daemonize yes，或者配置成 daemonize no。因为该配置和 docker run中的 -d 参数冲突，会导致容器一直启动失败
daemonize no

# 开启redis数据持久化， （可选）
appendonly yes
```

启动并入并挂载配置文件和数据文件的容器卷：

```shell
docker run -d -p 6379:6379 --name redis --privileged=true \
           -v /app/redis/redis.conf:/etc/redis/redis.conf \
           -v /app/redis/data:/data \
           redis:6.0.8 \
           redis-server /etc/redis/redis.conf
```

### 集群版本：

启动集群中三注三从的节点：

```shell
# --net host 使用宿主机的IP和端口，默认
# --cluster-enabled yes 开启redis集群
# --appendonly yes 开启redis持久化
# --port 6381 配置redis端口号
# 启动第1台节点
docker run -d --name redis-node-1 --net host --privileged=true -v /app/redis-cluster/share/redis-node-1:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6381

# 启动第2台节点
docker run -d --name redis-node-2 --net host --privileged=true -v /app/redis-cluster/share/redis-node-2:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6382

# 启动第3台节点
docker run -d --name redis-node-3 --net host --privileged=true -v /app/redis-cluster/share/redis-node-3:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6383

# 启动第4台节点
docker run -d --name redis-node-4 --net host --privileged=true -v /app/redis-cluster/share/redis-node-4:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6384

# 启动第5台节点
docker run -d --name redis-node-5 --net host --privileged=true -v /app/redis-cluster/share/redis-node-5:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6385

# 启动第6台节点
docker run -d --name redis-node-6 --net host --privileged=true -v /app/redis-cluster/share/redis-node-6:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6386
```

构建集群的主从关系：

```shell
# 任意进入其中某节点
docker exec -it redis-node-1 /bin/bash
# 构建主从关系
redis-cli --cluster create 192.168.xxx.xxx:6381 192.168.xxx.xxx:6382 192.168.xxx.xxx:6383 192.168.xxx.xxx:6384 192.168.xxx.xxx:6385 192.168.xxx.xxx:6386 --cluster-replicas 1
# redis尝试自动进行主从节点分配，redis自动分配结果完成后，需要输入 Yes 确认配置信息： 
M: f451eb48bbc0a7c31c7da022ffe80cc1696e0f37 192.168.xxx.xxx:6381
   slots:[0-5460] (5461 slots) master
M: 05984211b8c38222a73abeff1d4e459c0fe1efbc 192.168.xxx.xxx:6382
   slots:[5461-10922] (5462 slots) master
M: 1fc935c12b1d34a7df50aed643c195eb29bb3435 192.168.xxx.xxx:6383
   slots:[10923-16383] (5461 slots) master
S: f8d0de47114bf33438747acd713cce4e412ae721 192.168.xxx.xxx:6384
   replicates 1fc935c12b1d34a7df50aed643c195eb29bb3435
S: de0b393c17e452d856f6de2b348e9ca4e5aa4002 192.168.xxx.xxx:6385
   replicates f451eb48bbc0a7c31c7da022ffe80cc1696e0f37
S: 0c0767e13a09ee48541738d4163592cd9842c143 192.168.xxx.xxx:6386
   replicates 05984211b8c38222a73abeff1d4e459c0fe1efbc
Can I set the above configuration? (type 'yes' to accept):
```

输入`Yes`确认后，redis会向其他节点发送信息加入集群，并分配哈希槽： 

```shell
>>> Nodes configuration updated
>>> Assign a different config epoch to each node
>>> Sending CLUSTER MEET messages to join the cluster
Waiting for the cluster to join
.....
>>> Performing Cluster Check (using node 192.168.xxx.xxx:6381)
M: f451eb48bbc0a7c31c7da022ffe80cc1696e0f37 192.168.xxx.xxx:6381
   slots:[0-5460] (5461 slots) master
   1 additional replica(s)
M: 1fc935c12b1d34a7df50aed643c195eb29bb3435 192.168.xxx.xxx:6383
   slots:[10923-16383] (5461 slots) master
   1 additional replica(s)
M: 05984211b8c38222a73abeff1d4e459c0fe1efbc 192.168.xxx.xxx:6382
   slots:[5461-10922] (5462 slots) master
   1 additional replica(s)
S: 0c0767e13a09ee48541738d4163592cd9842c143 192.168.xxx.xxx:6386
   slots: (0 slots) slave
   replicates 05984211b8c38222a73abeff1d4e459c0fe1efbc
S: f8d0de47114bf33438747acd713cce4e412ae721 192.168.xxx.xxx:6384
   slots: (0 slots) slave
   replicates 1fc935c12b1d34a7df50aed643c195eb29bb3435
S: de0b393c17e452d856f6de2b348e9ca4e5aa4002 192.168.xxx.xxx:6385
   slots: (0 slots) slave
   replicates f451eb48bbc0a7c31c7da022ffe80cc1696e0f37
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

查看集群状态：

```shell
# 进入任意节点
docker exec -it redis-node-1 /bin/bash
redis-cli -p 6381
# 查看集群信息
# 分配的哈希槽数量 cluster_slots_assigned为16384，集群节点数量cluster_known_nodes为6 
cluster info
# 查看集群的节点信息
cluster nodes
```

集群读写说明：

报错：`k1`经过计算得到的哈希槽为12706，但是当前连接的redis-server为`6381`（即节点1），它的哈希槽为：`[0,5460]`（在创建构建主从关系时redis有提示，也可以通过 `cluster nodes`查看），所以会因为存不进去而报错。 

报错：`k1`经过计算得到的哈希槽为12706，但是当前连接的redis-server为`6381`（即节点1），它的哈希槽为：`[0,5460]`（在创建构建主从关系时redis有提示，也可以通过 `cluster nodes`查看），所以会因为存不进去而报错。 
执行 `set k2 v2`可以成功，因为`k2`计算出的哈希槽在`[0-5460]`区间中。 

```shell
# 进入任意节点
docker exec -it redis-node-1 /bin/bash
# 客户端连接不加-c参数时
redis-cli -p 6381
# 添加键值对可能成功也可能失败
set k1 v1
# 连接时使用-c，表示集群模式
redis-cli -p 6381 -c
```

集群信息检查：

```shell
# 进入任意节点
docker exec -it redis-node-1 /bin/bash
# 检查集群信息
# 输入任意一台主节点地址都可以进行集群检查
redis-cli --cluster check 192.168.xxx.xxx:6381
# 返回信息
# 当前集群中各个节点存储的key的数量
192.168.xxx.xxx:6381 (f451eb48...) -> 0 keys | 5461 slots | 1 slaves.
192.168.xxx.xxx:6383 (1fc935c1...) -> 1 keys | 5461 slots | 1 slaves.
192.168.xxx.xxx:6382 (05984211...) -> 0 keys | 5462 slots | 1 slaves.
[OK] 1 keys in 3 masters.  
0.00 keys per slot on average.

# 主从机器信息
>>> Performing Cluster Check (using node 192.168.xxx.xxx:6381)
M: f451eb48bbc0a7c31c7da022ffe80cc1696e0f37 192.168.xxx.xxx:6381
   slots:[0-5460] (5461 slots) master
   1 additional replica(s)
M: 1fc935c12b1d34a7df50aed643c195eb29bb3435 192.168.xxx.xxx:6383
   slots:[10923-16383] (5461 slots) master
   1 additional replica(s)
M: 05984211b8c38222a73abeff1d4e459c0fe1efbc 192.168.xxx.xxx:6382
   slots:[5461-10922] (5462 slots) master
   1 additional replica(s)
S: 0c0767e13a09ee48541738d4163592cd9842c143 192.168.xxx.xxx:6386
   slots: (0 slots) slave
   replicates 05984211b8c38222a73abeff1d4e459c0fe1efbc
S: f8d0de47114bf33438747acd713cce4e412ae721 192.168.xxx.xxx:6384
   slots: (0 slots) slave
   replicates 1fc935c12b1d34a7df50aed643c195eb29bb3435
S: de0b393c17e452d856f6de2b348e9ca4e5aa4002 192.168.xxx.xxx:6385
   slots: (0 slots) slave
   replicates f451eb48bbc0a7c31c7da022ffe80cc1696e0f37
[OK] All nodes agree about slots configuration.
>>> Check for open slots...
>>> Check slots coverage...
[OK] All 16384 slots covered.
```

集群模式下扩容：

因为业务量激增，需要向当前3主3从的集群中再加入1主1从两个节点。

启动带加入集群的redis节点：

```shell
# 启动第7台节点
docker run -d --name redis-node-7 --net host --privileged=true -v /app/redis-cluster/share/redis-node-7:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6387

# 启动第8台节点
docker run -d --name redis-node-8 --net host --privileged=true -v /app/redis-cluster/share/redis-node-8:/data redis:6.0.8 --cluster-enabled yes --appendonly yes --port 6388
```

加入到集群中：

```shell
# 进入任意一台待加入的节点
docker exec -it redis-node-7 /bin/bash
# 将6387作为master加入集群 
# 格式：redis-cli --cluster add-node 本节点地址 要加入的集群中的其中一个节点地址
redis-cli --cluster add-node 192.168.xxx.xxx:6387 192.168.xxx.xxx:6381
# 查看集群状态
redis-cli --cluster check 192.168.xxx.xxx:6381
# 发现6371节点已经作为master加入了集群，但是该节点没有被分配槽位。 
# 重新分配集群的槽位 
redis-cli --cluster reshard 192.168.xxx.xxx:6381
```

redis经过槽位检查后，会提示需要输入待分配的槽位数量： 

例如，我们现在是4台master，我们想要给node7分配4096个槽位，这样每个节点都是4096个槽位。
输入`4096`后，会让输入要接收这些哈希槽的节点ID，填入node7的节点ID即可。（就是节点信息中很长的一串十六进制串）。

然后会提示，询问要从哪些节点中分配出4096个槽分给Node7。一般选择 `all`，即将之前的3个主节点的槽位都均一些给Node7，这样可以使得每个节点的槽位数相等均衡。输入`all`之后，redis会列出一个计划，内容是自动从前面的3台master中拨出一部分槽位分给Node7的槽位，需要确认一下分配的计划。

输入`all`之后，redis会列出一个计划，内容是自动从前面的3台master中拨出一部分槽位分给Node7的槽位，需要确认一下分配的计划，输入`yes`确认后，redis便会自动重新reshard，给Node7分配槽位。 

检查集群信息：

```shell
redis-cli --cluster check 192.168.xxx.xxx:6381
```

可以看到集群中已分配出4096个槽位给到node7。

为新加入的节点node7添加从节点：

```shell
# redis便会向6388发送消息，使其加入集群并成为6387的从节点。
redis-cli --cluster add-node 192.168.xxx.xxx:6388 192.168.xxx.xxx:6381 --cluster-slave --cluster-master-id node7节点的十六进制编号字符串
# 检查集群的主从状态是否正常
redis-cli --cluster check 192.168.xxx.xxx:6381
```

**集群模式下的缩容：**