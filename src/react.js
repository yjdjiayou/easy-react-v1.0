import $ from 'jquery';
import {createUnit} from './unit';
import {createElement} from './element';
import {Component} from './component';

// element 可能是一个文本节点、DOM节点(div、span等)、自定义组件
function render(element, container) {
    // unit 单元就是用来负责渲染的，负责把元素转换成可以在页面上显示的 HTML 字符串
    let unit = createUnit(element);
    // 获取最终需要渲染的 HTML 内容
    let htmlString = unit.getHtmlString('0');
    $(container).html(htmlString);
    // 触发生命周期钩子 componentDidMount
    $(document).trigger('mounted');
    window.jq = $(document);
}


const React = {
    render,
    createElement,
    Component
};

export default React
