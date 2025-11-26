declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    // 定义 Vue 文件模块的类型。它导出的是一个 Vue 定义的组件。
    // 使用 DefineComponent 确保类型检查器能够理解组件的结构。
    const component: DefineComponent<{}, {}, any>
    export default component
}