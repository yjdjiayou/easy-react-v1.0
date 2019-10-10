import React from './react';

class Todos extends React.Component {
    constructor(props) {
        super(props);
        this.state = {list: [], text: ''};
    }

    onChange = (event) => {
        this.setState({text: event.target.value});
    };

    handleClick = (ev) => {
        let text = this.state.text;
        this.setState({
            list: [...this.state.list, text], text: ''
        });
    };

    onDel = (index) => {
        this.setState({
            list: [...this.state.list.slice(0, index), ...this.state.list.slice(index + 1)]
        });
    };

    componentDidMount(){
        console.log('组件挂载成功');
    }

    render() {
        let lists = this.state.list.map((item, index) => {
            return React.createElement('li', {}, item, React.createElement('button', {onClick: () => this.onDel(index)}, 'X'));
        });
        let input = React.createElement('input', {onKeyup: this.onChange, value: this.state.text});
        let button = React.createElement('button', {onClick: this.handleClick}, "+");
        return React.createElement('div', {}, input, button, React.createElement('ul', {}, ...lists));
    }
}


// 虚拟 dom 就是一个普通的对象
let element = React.createElement(Todos, {name: 'todos'});
React.render(element, document.getElementById('root'));