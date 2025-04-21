---
title: k8s安装基础组件（二进制方式）
createTime: 2025/04/21 22:47:28
permalink: /devops/k8s/base-components/
---

## Containerd安装

所有节点安装docker-ce-20.10：

```shell
yum install docker-ce-20.10.* docker-ce-cli-20.10.* -y
```

配置Containerd所需的模块（所有节点）：

```shell
cat <<EOF | sudo tee /etc/modules-load.d/containerd.conf
overlay
br_netfilter
EOF
```

所有节点加载模块：

```shell
modprobe -- overlay
modprobe -- br_netfilter
```

所有节点，配置Containerd所需的内核：

```shell
cat <<EOF | sudo tee /etc/sysctl.d/99-kubernetes-cri.conf
net.bridge.bridge-nf-call-iptables  = 1
net.ipv4.ip_forward                 = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF
```

所有节点加载内核：

```shell
sysctl --system
```

所有节点配置Containerd的配置文件：

```shell
mkdir -p /etc/containerd
containerd config default | tee /etc/containerd/config.toml
```

所有节点将Containerd的Cgroup改为Systemd：

```shell
vim /etc/containerd/config.toml
# 找到containerd.runtimes.runc.options，添加SystemdCgroup = true
# 所有节点将sandbox_image的Pause镜像改成符合自己版本的地址registry.cn-hangzhou.aliyuncs.com/google_containers/pause:3.6
```

所有节点启动Containerd，并配置开机自启动：

```shell
systemctl daemon-reload
systemctl enable --now containerd
```

所有节点配置crictl客户端连接的运行时位置：

```shell
cat > /etc/crictl.yaml <<EOF
runtime-endpoint: unix:///run/containerd/containerd.sock
image-endpoint: unix:///run/containerd/containerd.sock
timeout: 10
debug: false
EOF
```

