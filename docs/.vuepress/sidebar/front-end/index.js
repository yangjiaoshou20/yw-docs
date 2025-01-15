import {defineNoteConfig} from 'vuepress-theme-plume'

export const frontEnd = defineNoteConfig({
    dir: 'front-end',
    link: '/front/',
    sidebar: [{
        text: '开始',
        collapsed: false,
        icon: 'carbon:idea',
        items: [
            '开始',
        ],
    }
    ],
})
