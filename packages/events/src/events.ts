// Copyright IBM Corp. 2018. All Rights Reserved.
// Node module: @loopback/listener
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

// tslint:disable-next-line:no-any
export type Event = any;

/**
 * Async event listener function
 */
export type ListenerFunction = (
  /**
   * Event type
   */
  eventType: string,
  /**
   * Event data
   */
  event: Event,
) => Promise<void>;

/**
 * Async event listener Object
 */
export interface ListenerObject {
  /**
   * An optional name of the listener
   */
  name?: string;
  /**
   * Process an event
   * @param eventType Event type
   * @param event Event data
   */
  listen(eventType: string, event: Event): Promise<void>;
}

/**
 * A listener object or function
 */
export type Listener = ListenerObject | ListenerFunction;

/**
 * Emit an event to the given listener
 * @param listener Listener
 * @param eventType Event type
 * @param event Event data
 */
function emitEvent(listener: Listener, eventType: string, event: Event) {
  if (typeof listener === 'function') {
    return listener(eventType, event);
  }
  if (typeof listener.listen === 'function') {
    return listener.listen(eventType, event);
  }
  throw new Error(`Invalid listener: ${listener}`);
}

/**
 * An map of listeners keyed by event types
 */
export interface ListenerMap {
  [eventType: string]: Listener[];
}

/**
 * A subscription
 */
export interface Subscription {
  /**
   * Cancel the subscription
   */
  cancel(): void;
}

/**
 * An interface to describe an observable object
 */
export interface AsyncEventEmitter {
  /**
   * Get a list of listeners for the given source object and event type
   * @param source Source object
   * @param eventType Event type
   */
  getListeners(eventType: string): Listener[];

  /**
   * Subscribe to an event type
   * @param eventType Event type
   * @param listener An async event listener
   */
  subscribe(eventType: string, listener: Listener): Subscription;

  /**
   * Unsubscribe to an event type
   * @param eventType Event type
   * @param listener An async event listener
   */
  unsubscribe(eventType: string, listener: Listener): boolean;

  /**
   * Emit an event to all listeners in parallel
   * @param eventType Event type
   * @param event Event data
   */
  emit(eventType: string, event: Event): Promise<void>;

  /**
   * Notify listeners one by one with an event for the given type. It
   * will wait for the completion of listeners to process the event.
   * @param eventType Event type
   * @param event Event data
   */
  notify(eventType: string, event: Event): Promise<void>;
}

/**
 * A registry for observable objects
 */
export interface ListenerRegistry {
  /**
   * Get a list of listeners for the given source object and event type
   * @param source Source object
   * @param eventType Event type
   */
  getListeners(source: object, eventType: string): Listener[];

  /**
   * Subscribe to an event source and type
   * @param source Source object
   * @param eventType Event type
   * @param listener An async event listener
   */
  subscribe(
    source: object,
    eventType: string,
    listener: Listener,
  ): Subscription;

  /**
   * Unsubscribe to an event source and type
   * @param source Source object
   * @param eventType Event type
   * @param listener An async event listener
   */
  unsubscribe(source: object, eventType: string, listener: Listener): boolean;

  /**
   * Emit an event for the event source/type. It will not wait for the
   * completion of listeners to process the event.
   * @param source Source object
   * @param eventType Event type
   * @param event Event data
   */
  emit(source: object, eventType: string, event: Event): Promise<void>;

  /**
   * Notify listeners one by one with an event for the event source/type. It
   * will wait for the completion of listeners to process the event.
   * @param source Source object
   * @param eventType Event type
   * @param event Event data
   */
  notify(source: object, eventType: string, event: Event): Promise<void>;

  /**
   * Wrap an object to be an async event emitter
   * @param source Source object
   */
  createEventEmitter(source: object): AsyncEventEmitter;
}

/**
 * Default in-memory implementation of ListenerRegistry
 */
export class DefaultListenerRegistry implements ListenerRegistry {
  protected readonly registry = new WeakMap<object, ListenerMap>();

  getListeners(source: object, eventType: string) {
    let listenerMap = this.registry.get(source);
    if (!listenerMap) return [];
    return listenerMap[eventType] || [];
  }

  subscribe(source: object, eventType: string, listener: Listener) {
    let listenerMap = this.registry.get(source);
    if (!listenerMap) {
      listenerMap = {};
      this.registry.set(source, listenerMap);
    }
    let listeners = listenerMap[eventType];
    if (!listeners) {
      listeners = [];
      listenerMap[eventType] = listeners;
    }
    listeners.push(listener);
    return {
      cancel: () => {
        this.unsubscribe(source, eventType, listener);
      },
    };
  }

  unsubscribe(source: object, eventType: string, listener: Listener) {
    const listeners = this.getListeners(source, eventType);
    const index = listeners.indexOf(listener);
    if (index === -1) return false;
    listeners.splice(index, 1);
    return true;
  }

  async notify(source: object, eventType: string, event: Event) {
    const listeners = this.getListeners(source, eventType);
    for (const listener of listeners) {
      await emitEvent(listener, eventType, event);
    }
  }

  async emit(source: object, eventType: string, event: Event) {
    const listeners = this.getListeners(source, eventType);
    const promises = listeners.map(listener =>
      emitEvent(listener, eventType, event),
    );
    await Promise.all(promises);
  }

  createEventEmitter(source: object): AsyncEventEmitter {
    return new EventSource(source, this);
  }
}

/**
 * Event source
 */
export class EventSource implements AsyncEventEmitter {
  protected readonly registry: ListenerRegistry;
  protected readonly source: object;

  constructor(source?: object, registry?: ListenerRegistry) {
    this.source = source || this;
    this.registry = registry || new DefaultListenerRegistry();
  }

  getListeners(eventType: string) {
    return this.registry.getListeners(this.source, eventType);
  }

  subscribe(eventType: string, listener: Listener) {
    return this.registry.subscribe(this.source, eventType, listener);
  }

  unsubscribe(eventType: string, listener: Listener) {
    return this.registry.unsubscribe(this.source, eventType, listener);
  }

  emit(eventType: string, event: Event) {
    return this.registry.emit(this.source, eventType, event);
  }

  async notify(eventType: string, event: Event) {
    return this.registry.notify(this.source, eventType, event);
  }
}
