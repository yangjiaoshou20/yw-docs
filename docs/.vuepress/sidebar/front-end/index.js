import {defineCollection} from 'vuepress-theme-plume'

export const frontEnd = defineCollection({
    type: 'doc',
    dir: 'notes/front-end',
    linkPrefix: '/front/',
    title: '前端',
    sidebar: [
        {
            text: '开始',
            collapsed: false,
            icon: 'carbon:idea',
            items: ['开始'],
        },
        {
            text: 'Vue3 与 TypeScript',
            collapsed: false,
            icon: 'logos:vue',
            items: ['typescript-vue3', 'vue3-core'],
        },
        {
            text: '异步编程',
            collapsed: false,
            icon: 'carbon:ibm-cloud-pak-watson-openscale',
            items: ['promise-async'],
        },
        {
            text: '性能与大文件',
            collapsed: false,
            icon: 'carbon:cloud-satellite',
            items: ['web-worker'],
        },
    ],
})
