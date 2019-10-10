import {Element} from './element';
import $ from 'jquery';
import types from './types';

let diffQueue = [];// 差异队列
let updateDepth = 0;// 更新的级别

class Unit {
    constructor(element) {
        this._currentElement = element;
    }

    getHtmlString() {
        // 子类继承父类时，需要重写父类方法
        throw Error('此方法不能被调用');
    }
}

/**
 * 文本节点
 */
class TextUnit extends Unit {
    getHtmlString(reactId) {
        this._reactId = reactId;
        return `<span data-react-id="${reactId}">${this._currentElement}</span>`;
    }

    update(nextElement) {
        if (this._currentElement !== nextElement) {
            this._currentElement = nextElement;
            $(`[data-react-id="${this._reactId}"]`).html(this._currentElement);
        }
    }
}

/**
 {type:'button',props:{id:'sayHello'},children:['say',{type:'b',{},'Hello'}]}
 <button id="sayHello" style="color:red;background-color:'green" onclick="sayHello()">
 <span>say</span>
 <b>Hello</b>
 </button>
 */

/**
 * 原生 dom 节点
 */
class NativeUnit extends Unit {
    getHtmlString(reactId) {
        this._reactId = reactId;
        let {type, props} = this._currentElement;
        let tagStart = `<${type} data-react-id="${this._reactId}"`;
        let childString = '';
        let tagEnd = `</${type}>`;
        this._renderedChildrenUnits = [];
        // { id:'sayHello',onClick:sayHello,style:{color:'red',backgroundColor:'green'}},children:['say',{type:'b',{},'Hello'}]
        for (let propName in props) {
            // 如果是一个事件
            if (/^on[A-Z]/.test(propName)) {
                // 截取除 on 开头的字符串并将所有大写的字母转换成小写的
                // onClick  => click
                let eventName = propName.slice(2).toLowerCase();
                // react 中所有的事件都是委托到 document 上的
                // 利用 jq 事件注册的命名空间机制，当删除事件时，可以利用 data-react-id 高效的直接删除
                $(document).delegate(`[data-react-id="${this._reactId}"]`, `${eventName}.${this._reactId}`, props[propName]);
            }
            // 如果是一个样式对象
            else if (propName === 'style') {
                let styleObj = props[propName];
                let styles = Object.entries(styleObj).map(([attr, value]) => {
                    return `${attr.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${value}`;
                }).join(';');
                tagStart += (` style="${styles}" `);
            }
            // 如果是一个类名
            else if (propName === 'className') {
                tagStart += (` class="${props[propName]}" `);
            } else if (propName === 'children') {
                let children = props[propName];
                children.forEach((child, index) => {
                    let childUnit = createUnit(child);
                    // 每个 unit 都有一个 _mountIndex 属性，指向自己在父节点中的索引位置
                    childUnit._mountIndex = index;
                    this._renderedChildrenUnits.push(childUnit);
                    let childMarkUp = childUnit.getHtmlString(`${this._reactId}.${index}`);
                    childString += childMarkUp;
                });
            } else {
                tagStart += (` ${propName}=${props[propName]} `);
            }
        }
        return tagStart + ">" + childString + tagEnd;
    }

    update(nextElement) {
        let oldProps = this._currentElement.props;
        let newProps = nextElement.props;
        this.updateDOMProperties(oldProps, newProps);
        this.updateDOMChildren(nextElement.props.children);
    }

    updateDOMChildren(newChildrenElements) {
        updateDepth++;
        this.diff(diffQueue, newChildrenElements);
        console.log(diffQueue);
        updateDepth--;
        if (updateDepth === 0) {
            this.patch(diffQueue);
            diffQueue = [];
        }
    }

    patch(diffQueue) {
        let deleteChildren = [];//这里要放着所有将要删除的节点
        let deleteMap = {};//这里暂存能复用的节点
        for (let i = 0; i < diffQueue.length; i++) {
            let difference = diffQueue[i];
            if (difference.type === types.MOVE || difference.type === types.REMOVE) {
                let fromIndex = difference.fromIndex;
                let oldChild = $(difference.parentNode.children().get(fromIndex));
                if (!deleteMap[difference.parentId]) {
                    deleteMap[difference.parentId] = {}
                }
                deleteMap[difference.parentId][fromIndex] = oldChild;
                deleteChildren.push(oldChild);
            }
        }
        $.each(deleteChildren, (idx, item) => $(item).remove());

        for (let i = 0; i < diffQueue.length; i++) {
            let difference = diffQueue[i];
            switch (difference.type) {
                case types.INSERT:
                    this.insertChildAt(difference.parentNode, difference.toIndex, $(difference.markUp));
                    break;
                case types.MOVE:
                    this.insertChildAt(difference.parentNode, difference.toIndex, deleteMap[difference.parentId][difference.fromIndex]);
                    break;
                default:
                    break;
            }
        }
    }

    insertChildAt(parentNode, index, newNode) {
        let oldChild = parentNode.children().get(index);
        oldChild ? newNode.insertBefore(oldChild) : newNode.appendTo(parentNode);
    }

    diff(diffQueue, newChildrenElements) {
        // 生成一个子元素单元的 map => {key:老的 unit}
        let oldChildrenUnitMap = this.getOldChildrenMap(this._renderedChildrenUnits);
        // 生成一个新子元素单元的 map 和数组
        let {newChildrenUnitMap, newChildrenUnits} = this.getNewChildren(oldChildrenUnitMap, newChildrenElements);
        // 上一个"已经确定好位置的"(在新的集合中，已经排列好顺序的)节点在老的集合中的索引
        let lastIndex = 0;
        for (let i = 0; i < newChildrenUnits.length; i++) {
            let newUnit = newChildrenUnits[i];
            // 获取当前节点的 key
            let newKey = (newUnit._currentElement.props && newUnit._currentElement.props.key) || i.toString();
            // 在老的集合中查找 key 对应的节点
            let oldChildUnit = oldChildrenUnitMap[newKey];
            // 如果相等的话，那就复用老的节点
            // console.log(oldChildUnit);
            // console.log(newUnit);
            if (oldChildUnit === newUnit) {
                // 如果老节点的挂载索引 小于 上一个"已经确定好位置的"节点的索引
                // 说明在老的集合中，这个老节点的位置是排在 上一个"已经确定好位置的"节点 前面的
                // 按照新的集合排列顺序，需要把它移动到 上一个"已经确定好位置的"节点 后面去
                if (oldChildUnit._mountIndex < lastIndex) {
                    diffQueue.push({
                        parentId: this._reactId,
                        parentNode: $(`[data-react-id="${this._reactId}"]`),
                        type: types.MOVE,
                        // 老集合中的排列位置
                        fromIndex: oldChildUnit._mountIndex,
                        // 新集合中的排列位置
                        toIndex: i
                    });
                }
                lastIndex = Math.max(lastIndex, oldChildUnit._mountIndex);
            }
            // 如果新旧节点不相等
            // 要么是老的集合中找不到该节点，需要新增
            // 要么就是新的集合中不存在该节点，需要删除
            else {
                // 节点删除
                console.log('oldChildUnit',oldChildUnit);
                if (oldChildUnit) {
                    // diffQueue.push({
                    //     parentId: this._reactId,
                    //     parentNode: $(`[data-react-id="${this._reactId}"]`),
                    //     type: types.REMOVE,
                    //     fromIndex: oldChildUnit._mountIndex
                    // });
                    // this._renderedChildrenUnits = this._renderedChildrenUnits.filter(item => item !== oldChildUnit);
                    // $(document).undelegate(`.${oldChildUnit._reactId}`);
                }
                // 节点新增
                else{
                    diffQueue.push({
                        parentId: this._reactId,
                        parentNode: $(`[data-react-id="${this._reactId}"]`),
                        type: types.INSERT,
                        toIndex: i,
                        markUp: newUnit.getHtmlString(`${this._reactId}.${i}`)
                    });
                }
            }
            // 给当前节点设置新的挂载索引
            newUnit._mountIndex = i;
        }

        for (let oldKey in oldChildrenUnitMap) {
            let oldChild = oldChildrenUnitMap[oldKey];
            if (!newChildrenUnitMap.hasOwnProperty(oldKey)) {
                diffQueue.push({
                    parentId: this._reactId,
                    parentNode: $(`[data-react-id="${this._reactId}"]`),
                    type: types.REMOVE,
                    fromIndex: oldChild._mountIndex
                });
                // 如果要删除掉某一个节点，则要把它对应的 unit也删除掉
                this._renderedChildrenUnits = this._renderedChildrenUnits.filter(item => item !== oldChild);
                // 还要把这个节对应的事件委托也删除掉
                $(document).undelegate(`.${oldChild._reactId}`);
            }
        }

    }

    getNewChildren(oldChildrenUnitMap, newChildrenElements) {
        let newChildrenUnits = [];
        let newChildrenUnitMap = {};
        newChildrenElements.forEach((newElement, index) => {
            // 一定要给定 key，如果使用这里的 index 作为 key ，会消耗大量的性能
            let newKey = (newElement.props && newElement.props.key) || index.toString();
            let oldUnit = oldChildrenUnitMap[newKey];//找到老的unit
            let oldElement = oldUnit && oldUnit._currentElement;//获取老元素
            if (shouldDeepCompare(oldElement, newElement)) {
                // 深度遍历，直到所有子元素更新完毕
                // oldUnit 可以是文本单元、原生 dom 节点单元、组件单元 ，调用各自不同的更新逻辑
                oldUnit.update(newElement);
                newChildrenUnits.push(oldUnit);
                newChildrenUnitMap[newKey] = oldUnit;
            } else {
                let nextUnit = createUnit(newElement);
                newChildrenUnits.push(nextUnit);
                newChildrenUnitMap[newKey] = nextUnit;
                this._renderedChildrenUnits[index] = nextUnit;
            }
        });
        return {newChildrenUnitMap, newChildrenUnits};
    }

    getOldChildrenMap(childrenUnits = []) {
        let map = {};
        for (let i = 0; i < childrenUnits.length; i++) {
            let unit = childrenUnits[i];
            let key = (unit._currentElement.props && unit._currentElement.props.key) || i.toString();
            map[key] = unit;
        }
        return map;
    }

    updateDOMProperties(oldProps, newProps) {
        let propName;
        for (propName in oldProps) {//循环老的属性集合
            if (!newProps.hasOwnProperty(propName)) {
                $(`[data-react-id="${this._reactId}"]`).removeAttr(propName);
            }
            if (/^on[A-Z]/.test(propName)) {
                $(document).undelegate(`.${this._reactId}`);
            }
        }
        for (propName in newProps) {
            // 如果是 children 属性的话，我们先不处理
            if (propName === 'children') {
                // continue;
            } else if (/^on[A-Z]/.test(propName)) {
                let eventName = propName.slice(2).toLowerCase();
                $(document).delegate(`[data-react-id="${this._reactId}"]`, `${eventName}.${this._reactId}`, newProps[propName]);
            } else if (propName === 'className') {
                // $(`[data-react-id="${this._reactId}"]`)[0].className = newProps[propName];
                $(`[data-react-id="${this._reactId}"]`).attr('class', newProps[propName]);
            } else if (propName === 'style') {
                let styleObj = newProps[propName];
                Object.entries(styleObj).map(([attr, value]) => {
                    $(`[data-react-id="${this._reactId}"]`).css(attr, value);
                })
            } else {
                $(`[data-react-id="${this._reactId}"]`).prop(propName, newProps[propName]);
            }
        }
    }
}

/**
 * 复合单元——组件内部可能还包含组件、dom 节点、文本节点
 */
// _currentElement => 当前 react 元素（虚拟 dom）
// _componentInstance => 当前组件实例
// _currentUnit => 当前组件单元
// _renderedUnitInstance => 当前组件渲染内容(子内容)的单元
class CompositeUnit extends Unit {
    // 组件更新
    update(nextElement, partialState) {
        this._currentElement = nextElement || this._currentElement;
        // 获取新的状态,不管要不要更新组件，组件的状态一定要修改
        let nextState = Object.assign(this._componentInstance.state, partialState);
        // 新的属性对象
        let nextProps = this._currentElement.props;
        if (this._componentInstance.shouldComponentUpdate && !this._componentInstance.shouldComponentUpdate(nextProps, nextState)) {
            return;
        }
        // 获取上次渲染的单元
        let preRenderedUnitInstance = this._renderedUnitInstance;
        // 虚拟 dom —— 普通的 js 对象
        // 获取上次渲染的元素（虚拟 dom ）
        let preRenderedElement = preRenderedUnitInstance._currentElement;
        // 获取新的渲染的元素（虚拟 dom ）
        let nextRenderElement = this._componentInstance.render();
        // 如果新旧两个元素类型一样，则可以进行深度比较，深度比较交给子元素自己去比较，父组件不参与
        // 如果不一样，直接干掉老的元素，新建新的
        if (shouldDeepCompare(preRenderedElement, nextRenderElement)) {
            // 深度比较交给子元素自己去比较
            // 子元素可能是一个文本节点、DOM节点(div、span等)、自定义组件
            preRenderedUnitInstance.update(nextRenderElement);
            this._componentInstance.componentDidUpdate && this._componentInstance.componentDidUpdate();
        } else {
            this._renderedUnitInstance = createUnit(nextRenderElement);
            let nextHtmlString = this._renderedUnitInstance.getHtmlString();
            $(`[data-react-id="${this._reactId}"]`).replaceWith(nextHtmlString);
        }
    }

    getHtmlString(reactId) {
        this._reactId = reactId;
        let {type: Component, props} = this._currentElement;
        let componentInstance = this._componentInstance = new Component(props);
        // 让组件的实例的 currentUnit 属性等于当前的 unit
        componentInstance._currentUnit = this;
        // 如果有组件将要渲染的函数就执行
        componentInstance.componentWillMount && componentInstance.componentWillMount();
        // 调用组件的 render 方法，获取“当前组件”要渲染的元素——可能是一个文本节点、DOM节点(div、span等)、自定义组件
        let renderedElement = componentInstance.render();
        let renderedUnitInstance = this._renderedUnitInstance = createUnit(renderedElement);
        // 获取 html 内容
        let renderedHtmlString = renderedUnitInstance.getHtmlString(this._reactId);
        // 监听挂载完成事件
        $(document).on('mounted', () => {
            componentInstance.componentDidMount && componentInstance.componentDidMount();
        });
        return renderedHtmlString;
    }

}


/**
 * 判断新、旧两个元素是否需要进行深度比较
 * @param oldElement
 * @param newElement
 * @returns {boolean}
 */
function shouldDeepCompare(oldElement, newElement) {
    if (oldElement != null && newElement != null) {
        let oldType = typeof oldElement;
        let newType = typeof newElement;
        // 如果新、旧元素都是文本节点，直接替换
        if ((oldType === 'string' || oldType === 'number') && (newType === 'string' || newType === 'number')) {
            return true;
        }
        // 如果新、旧元素都是非文本节点（dom 节点、组件），判断两个元素的类型是否一致
        // 一致就需要进行深度比较，不一致直接替换旧的元素
        if (oldElement instanceof Element && newElement instanceof Element) {
            return oldElement.type === newElement.type;
        }
    }
    // 其他情况，直接替换旧的元素
    return false;
}

/**
 * 利用工厂模式创建不同类型的单元
 * @param element
 * @returns {Unit}
 */
function createUnit(element) {
    // element 可能是一个文本节点、DOM节点(div、span等)、自定义组件
    if (typeof element === 'string' || typeof element === 'number') {
        return new TextUnit(element);
    }
    if (element instanceof Element && typeof element.type === 'string') {
        return new NativeUnit(element);
    }
    if (element instanceof Element && typeof element.type === 'function') {
        return new CompositeUnit(element);
    }
}

export {
    createUnit
}
