---
title: k8s安装基本配置（二进制方式）
createTime: 2025/04/16 21:59:33
permalink: /devops/k8s/base-config/
---
### 环境准备

实验环境：centOS7.6、k8s1.30

建议：生产环境中，建议使用小版本大于5的Kubernetes版本，比如1.30.5以后的才可用于生产环境。

#### 节点规划：

3台master节点+两台node节点

修改网卡信息：

```shell
# 修改网卡信息
sudo vi /etc/sysconfig/network-scripts/ifcfg-ens33
# 修改网卡信息（以master01为例）
TYPE="Ethernet"
PROXY_METHOD="none"
BROWSER_ONLY="no"
BOOTPROTO="static" # 修改为static
DEFROUTE="yes"
IPV4_FAILURE_FATAL="no"
IPV6INIT="no" # 禁用IPV6
# IPV6_AUTOCONF="yes"
# IPV6_DEFROUTE="yes"
# IPV6_FAILURE_FATAL="no"
# IPV6_ADDR_GEN_MODE="stable-privacy"
NAME="ens33"
UUID="09d91c45-c45a-4f53-a0d4-183a370427e2"
DEVICE="ens33"
ONBOOT="yes"
# 新增静态IP参数
IPADDR=192.168.1.11 # 设置静态 IP 地址
NETMASK=255.255.255.0 # 子网掩码
GATEWAY=192.168.1.1 # 网关地址
DNS1=192.168.1.1 # 主 DNS
DNS2=8.8.8.8 # 备用 DNS

# 修改完成重启网卡
sudo systemctl restart network
# 查看网卡配置信息
ip addr show ens33
```

节点信息：

| 主机名               | IP地址            | 角色              | 配置       |
| ----------------- | --------------- | --------------- | -------- |
| k8s-master01 ~ 03 | 192.168.1.11~13 | Master/Worker节点 | 2C2G 40G |
| k8s-node01 ~ 02   | 192.168.1.21~22 | Worker节点        | 2C2G 40G |
| k8s-master-lb     | 192.168.1.30    | VIP             | VIP不占用机器 |

组件版本信息：

| 信息        | 备注         |
| --------- | ---------- |
| 系统版本      | CentOS 7.6 |
| Docker版本  | 20.10.x    |
| K8s版本     | 1.30.x     |
| Pod网段     |            |
| Service网段 |            |

### 基础配置

主机信息，服务器IP地址不能设置成dhcp，要配置成静态IP。

**修改host**:

所有节点配置hosts，修改/etc/hosts追加信息如下：

```shell
# sudo vi /etc/hosts
192.168.1.11 k8s-master01 # 2C2G 40G
192.168.1.12 k8s-master02 # 2C2G 40G
192.168.1.13 k8s-master03 # 2C2G 40G
192.168.1.30 k8s-master-lb # VIP 虚IP不占用机器资源 如果不是高可用集群，该IP为Master01的IP
192.168.1.21 k8s-node01 # 2C2G 40G
192.168.1.22 k8s-node02 # 2C2G 40G
```

VIP（虚拟IP）不要和公司内网IP重复，首先去ping一下，不通才可用。VIP需要和主机在同一个局域网内！公有云的话，VIP为公有云的负载均衡的IP，比如阿里云的SLB地址，腾讯云的ELB地址，注意公有云的负载均衡都是内网的负载均衡。

**配置yum源：**

所有节点配置yum源：

```shell
# 使用 curl 命令从阿里云镜像站下载 CentOS-7 的 Yum 仓库配置文件，并将其保存到 /etc/yum.repos.d/ 目录下，覆盖或替换原有的 CentOS-Base.repo 文件
curl -o /etc/yum.repos.d/CentOS-Base.repo https://mirrors.aliyun.com/repo/Centos-7.repo
# 自动安装三个软件包，为后续安装 Docker 做准备
yum install -y yum-utils device-mapper-persistent-data lvm2
# 添加 Docker 的官方仓库（通过阿里云镜像站加速）
yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
# 修改 CentOS-Base.repo 文件，删除包含 mirrors.cloud.aliyuncs.com 和 mirrors.aliyuncs.com 的行
sed -i -e '/mirrors.cloud.aliyuncs.com/d' -e '/mirrors.aliyuncs.com/d' /etc/yum.repos.d/CentOS-Base.repo
```

**安装必备工具：**

```shell
yum install wget jq psmisc vim net-tools telnet yum-utils device-mapper-persistent-data lvm2 git -y
```

**关闭防火墙等服务：**

所有节点关闭防火墙、selinux、dnsmasq、swap：

```shell
systemctl disable --now firewalld 
systemctl disable --now dnsmasq
systemctl disable --now NetworkManager

setenforce 0
sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/sysconfig/selinux
sed -i 's#SELINUX=enforcing#SELINUX=disabled#g' /etc/selinux/config

swapoff -a && sysctl -w vm.swappiness=0
sed -ri '/^[^#]*swap/s@^@#@' /etc/fstab
```

**同步节点间的时钟：**

```shell
# 安装ntpdate
rpm -ivh http://mirrors.wlnmp.com/centos/wlnmp-release-centos.noarch.rpm
yum install ntpdate -y
# 查看是否已安装
yum list installed | grep ntpdate
```

所有节点同步时间。时间同步配置如下：

```shell
ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
echo 'Asia/Shanghai' >/etc/timezone
ntpdate time2.aliyun.com
# 加入到crontab
crontab -e
# 添加以下内容
*/5 * * * * /usr/sbin/ntpdate time2.aliyun.com
```

**所有节点配置limit：**

```shell
ulimit -SHn 65535
# vim /etc/security/limits.conf
# 末尾添加如下内容
* soft nofile 655360
* hard nofile 131072
* soft nproc 655350
* hard nproc 655350
* soft memlock unlimited
* hard memlock unlimited
```

Master01节点免密钥登录其他节点，安装过程中生成配置文件和证书均在Master01上操作，集群管理也在Master01上操作，密钥配置如下：

说明：阿里云或者AWS上需要单独一台kubectl服务器。

```shell
ssh-keygen -t rsa
```

Master01配置免密码登录其他节点

```shell
for i in k8s-master01 k8s-master02 k8s-master03 k8s-node01 k8s-node02;do ssh-copy-id -i .ssh/id_rsa.pub $i;done
```

所有节点安装基本工具

```shell
yum install wget jq psmisc vim net-tools yum-utils device-mapper-persistent-data lvm2 git -y
```

Master01下载安装文件在作者的github上

```shell
cd /root/ ; git clone https://github.com/dotbalo/k8s-ha-install.git
```

```shell
#CentOS7需要升级系统
yum update -y --exclude=kernel*
```

### 内核升级

所有节点内核至4.19：

```shell
# 查询当前系统内核 Linux k8s-master01 3.10.0-957.el7.x86_64 #1 SMP Thu Nov 8 23:39:32 UTC 2018 x86_64 x86_64 x86_64 GNU/Linux
uname -a
# 内核升级 在master01节点下载内核
cd /root
wget http://193.49.22.109/elrepo/kernel/el7/x86_64/RPMS/kernel-ml-devel-4.19.12-1.el7.elrepo.x86_64.rpm
wget http://193.49.22.109/elrepo/kernel/el7/x86_64/RPMS/kernel-ml-4.19.12-1.el7.elrepo.x86_64.rpm
# 传送安装文件到其他节点
for i in k8s-master02 k8s-master03 k8s-node01 k8s-node02;do scp kernel-ml-4.19.12-1.el7.elrepo.x86_64.rpm kernel-ml-devel-4.19.12-1.el7.elrepo.x86_64.rpm $i:/root/ ; done
# 所有节点安装内核
cd /root && yum localinstall -y kernel-ml*

# 查询所有可用内核
awk -F\' '/menuentry / {print $2}' /boot/grub2/grub.cfg

# 设置默认启动项为 4.19 内核
sudo grubby --set-default="/boot/vmlinuz-4.19.12-1.el7.elrepo.x86_64"

# 检查默认内核是不是4.19
grubby --default-kernel

# 所有节点重启，然后检查内核是不是4.19
reboot
uname -a
```

**所有节点安装ipvsadm：**

```shell
# 所有节点安装ipvsadm
yum install ipvsadm ipset sysstat conntrack libseccomp -y
```

所有节点配置ipvs模块

在内核4.19+版本nf_conntrack_ipv4已经改为nf_conntrack，4.18以下使用nf_conntrack_ipv4即可

```shell
# 加载相应的模块
modprobe -- ip_vs
modprobe -- ip_vs_rr
modprobe -- ip_vs_wrr
modprobe -- ip_vs_sh
modprobe -- nf_conntrack
# vim /etc/modules-load.d/ipvs.conf
# 加入以下内容
ip_vs
ip_vs_lc
ip_vs_wlc
ip_vs_rr
ip_vs_wrr
ip_vs_lblc
ip_vs_lblcr
ip_vs_dh
ip_vs_sh
ip_vs_fo
ip_vs_nq
ip_vs_sed
ip_vs_ftp
ip_vs_sh
nf_conntrack
ip_tables
ip_set
xt_set
ipt_set
ipt_rpfilter
ipt_REJECT
ipip
# 重启服务
systemctl enable --now systemd-modules-load.service
# 检查是否加载
lsmod | grep -e ip_vs -e nf_conntrack
```

**开启一些k8s集群中必须的内核参数：**

**所有节点配置k8s内核：**

```shell
cat <<EOF > /etc/sysctl.d/k8s.conf
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.bridge.bridge-nf-call-ip6tables = 1
fs.may_detach_mounts = 1
vm.overcommit_memory=1
vm.panic_on_oom=0
fs.inotify.max_user_watches=89100
fs.file-max=52706963
fs.nr_open=52706963
net.netfilter.nf_conntrack_max=2310720

net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_probes = 3
net.ipv4.tcp_keepalive_intvl =15
net.ipv4.tcp_max_tw_buckets = 36000
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_max_orphans = 327680
net.ipv4.tcp_orphan_retries = 3
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 16384
net.ipv4.ip_conntrack_max = 65536
net.ipv4.tcp_max_syn_backlog = 16384
net.ipv4.tcp_timestamps = 0
net.core.somaxconn = 16384
EOF
sysctl --system
```

所有节点配置完内核后，重启服务器，保证重启后内核依旧加载

```shell
reboot
# 查询内饰是否正常加载
lsmod | grep --color=auto -e ip_vs -e nf_conntrack
```


