import type {NavItemWithLink} from 'vuepress-theme-plume'
import {defineNavbarConfig} from 'vuepress-theme-plume'

const navbar: NavItemWithLink[] = [
    {
        text: '前端',
        link: '/front/start/',
    },
    {
        text: '后端',
        link: '/back/start/',
    },
    {
        text: '运维',
        link: '/devops/start/',
    },
    {
        text: '博客',
        link: '/blog/',
    },
]

export default defineNavbarConfig(navbar)