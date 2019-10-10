class Element {
    constructor(type, props) {
        this.type = type;
        this.props = props;
    }
}

// React.createElement 的参数(type，props，children)
// type 可以是字符串，也可以是一个函数
function createElement(type, props = {}, ...children) {
    // children 也是 props 的一个属性
    props.children = children || [];
    return new Element(type, props);
}

export {
    Element,
    createElement
}