/* global window, document */
import React, { Component } from "react";
import PropTypes from "prop-types";
import throttle from "lodash.throttle";
import omit from 'lodash.omit';
import shallowequal from "shallowequal";

export default class TrackVisibility extends Component {
  static propTypes = {
    /**
     * Define if the visibility need to be tracked once
     */
    once: PropTypes.bool,

    /**
     * Tweak the throttle interval
     * Check https://css-tricks.com/debouncing-throttling-explained-examples/ for more details
     */
    throttleInterval(props, propName, component) {
      const currentProp = props[propName];
      if (!Number.isInteger(currentProp) || currentProp < 0) {
        return new Error(
          `The ${propName} prop you provided to ${component} is not a valid integer >= 0.`
        );
      }
      return null;
    },
    /**
     * Pass one or more children to track
     */
    children: PropTypes.oneOfType([
      PropTypes.func,
      PropTypes.element,
      PropTypes.arrayOf(PropTypes.element)
    ]),
    /**
     * Additional style to apply
     */
    style: PropTypes.object,

    /**
     * Additional className to apply
     */
    className: PropTypes.string,

    /**
     * Define an offset. Can be useful for lazy loading
     */
    offset: PropTypes.number,

    /**
     * Update the visibility state as soon as a part of the tracked component is visible
     */
    partialVisibility: PropTypes.bool,

    /**
     * Exposed for testing but allows node other than internal wrapping <div /> to be tracked
     * for visibility
     */
    nodeRef: PropTypes.object,

    /**
     * Reference container for listeners
     */
    container: PropTypes.any,
    useCustomContainer: PropTypes.bool,
  };

  static defaultProps = {
    once: false,
    throttleInterval: 150,
    children: null,
    style: null,
    className: null,
    offset: 0,
    partialVisibility: false,
    nodeRef: null,
    container: null,
    useCustomContainer: false,
  };
  
  constructor(props) {
    super(props);
    
    this.state = {
        isVisible: false
    };
    this.throttleCb = throttle(
      this.isComponentVisible,
      this.props.throttleInterval
    );

    props.nodeRef && this.setNodeRef(props.nodeRef);
    this.attachListener = this.attachListener.bind(this);
    this.removeListener = this.removeListener.bind(this);
  }

  componentDidMount() {
    if (!this.props.useCustomContainer && typeof window !== 'undefined') {
      this.attachListener(window);
    }
    setTimeout(this.isComponentVisible, 0);
  }

  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      this.removeListener(this.props.useCustomContainer ? this.props.container : window);
    }
  }

  /**
   * Only update (call render) if the state has changed or one of the components configured props
   * (something in defaultProps) has been changed. This allows recalculation of visibility on prop
   * change (using componentWillReceiveProps) without vDOM diff'ing by React.
   */
  shouldComponentUpdate(nextProps, nextState) {
    return !shallowequal(this.state, nextState)
      || !shallowequal(this.getOwnProps(omit(this.props, ['container'])), this.getOwnProps(omit(nextProps, ['container'])));
  }
  
  /**
   * Trigger visibility calculation only when non-own props change
   */
  componentWillReceiveProps(nextProps) {
    console.log(nextProps);
    
    if (this.props.useCustomContainer && nextProps.container && this.props.container !== nextProps.container) {
      this.attachListener(nextProps.container);
    }
    if (!shallowequal(this.getChildProps(omit(this.props, ['container'])), this.getChildProps(omit(nextProps, ['container'])))) {
      if ((this.props.useCustomContainer && nextProps.container) || !this.props.useCustomContainer) {
        setTimeout(() => this.isComponentVisible(this.props.useCustomContainer ? nextProps.container : window), 0);
      }
    }
  }

  attachListener(container) {
    console.log('attachListener', container, this.props);
    container.addEventListener("scroll", this.throttleCb);
    container.addEventListener("resize", this.throttleCb);
  }

  removeListener(container) {
    console.log('removeListener', container, this.props);
    container.removeEventListener("scroll", this.throttleCb);
    container.removeEventListener("resize", this.throttleCb);
  }

  getOwnProps(props = this.props) {
    const ownProps = {};
    Object.keys(TrackVisibility.defaultProps).forEach(key => {
      ownProps[key] = props[key];
    });
    return ownProps;
  }

  getChildProps(props = this.props) {
    const childProps = {};
    Object.keys(props).forEach(key => {
      if (!{}.hasOwnProperty.call(TrackVisibility.defaultProps, key)) {
        childProps[key] = props[key];
      }
    });
    return childProps;
  }

  isVisible = ({ top, left, bottom, right, width, height }, windowWidth, windowHeight) => {
    const { offset, partialVisibility } = this.props;

    if (top + right + bottom + left === 0) {
      return false;
    }

    const topThreshold = 0 - offset;
    const leftThreshold = 0 - offset;
    const widthCheck = windowWidth + offset;
    const heightCheck = windowHeight + offset;

    return partialVisibility
      ? top + height >= topThreshold
        && left + width >= leftThreshold
        && bottom - height <= heightCheck
        && right - width <= widthCheck
      : top >= topThreshold
        && left >= leftThreshold
        && bottom <= heightCheck
        && right <= widthCheck;
  }
  
  isComponentVisible = (fallbackContainer) => {
    if (typeof window === 'undefined') return;
    const html = document.documentElement;
    const { once, container, useCustomContainer } = this.props;
    const boundingClientRect = this.nodeRef.getBoundingClientRect();
    const windowWidth = window.innerWidth || html.clientWidth;
    const windowHeight = window.innerHeight || html.clientHeight;
    
    const isVisible = this.isVisible(boundingClientRect, windowWidth, windowHeight);
    
    if (isVisible && once) {
      this.removeListener(useCustomContainer ? (container || fallbackContainer) : window);
    }
    
    this.setState({ isVisible });
  }
  
  setNodeRef = ref => this.nodeRef = ref;
  
  getChildren() {
    if(typeof this.props.children === "function") {
      return this.props.children({
        ...this.getChildProps(),
        isVisible: this.state.isVisible
      })
    }

    return React.Children.map(this.props.children, child =>
      React.cloneElement(child, {
        ...this.getChildProps(),
        isVisible: this.state.isVisible
      })
    );
  }

  render() {
    const { className, style, nodeRef } = this.props;
    const props = {
      ...(className !== null && { className }),
      ...(style !== null && { style }),
    };

    return (
      <div ref={!nodeRef && this.setNodeRef} {...props}>
        {this.getChildren()}
      </div>
    );
  }
}
