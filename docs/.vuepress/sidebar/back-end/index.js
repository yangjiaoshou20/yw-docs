import {defineNoteConfig} from 'vuepress-theme-plume'

export const backEnd = defineNoteConfig({
    dir: 'back-end',
    link: '/back/',
    sidebar: [
        {
            text: '开始',
            collapsed: false,
            icon: 'ph:code-bold',
            items: ['开始'],
        },
        {
            text: 'JVM 与容器化',
            collapsed: false,
            icon: 'carbon:container-software',
            items: ['jvm/容器化内存与OOM治理', 'jvm/优雅停机与GC开销'],
        },
        {
            text: '并发编程',
            collapsed: false,
            icon: 'carbon:flow',
            prefix: 'concurrency',
            items: ['Java线程中断标志位与优雅停止'],
        },
    ],
})
