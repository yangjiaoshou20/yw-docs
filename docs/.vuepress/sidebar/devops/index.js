import {defineNoteConfig} from 'vuepress-theme-plume'

export const devops = defineNoteConfig({
    dir: 'devops',
    link: '/devops/',
    sidebar: [{
        text: '开始',
        collapsed: false,
        icon: 'ph:code-bold',
        items: [
            '开始',
            {
                text: 'docker',
                icon: 'ph:code-bold',
                prefix: 'docker',
                collapsed: false,
                items: [
                    '介绍',
                    'docker安装',
                    'docker常用命令',
                    'docker容器命令',
                    'docker核心命令',
                    'docker镜像加载原理',
                    'docker镜像仓库',
                    'docker容器卷',
                    'docker安装常用软件',
                    'DockerFile使用',
                    '使用Dockerfile发布微服务',
                    'Docker容器网络',
                    'docker-compose容器编排',
                ],
            },
            {
                text: 'k8s',
                icon: 'ph:code-bold',
                prefix: 'k8s',
                collapsed: false,
                items: [
                    'k8s安装基本配置（二进制方式）',
                    'k8s安装基础组件（二进制方式）',
                ],
            }
        ],
    }],
})
