
type LRUNode<T> = {
    prev: LRUNode<T>;
    next: LRUNode<T>;
    value: T;
    key:string;
}

export interface LRUCache<T> {
    head: LRUNode<T>;
    tail: LRUNode<T>;
    size: number;
    capacity: number;
    hash: { [key: string]: LRUNode<T> };
}

export const makeLRUCache = <T>(capacity: number): LRUCache<T> => {
    // @ts-ignore
    const head: LRUNode<T> = { prev: null, next: null, value: null };
    // @ts-ignore
    const tail: LRUNode<T> = { prev: head, next: null, value: null };
    head.next = tail;
    return { head, tail, size: 0, capacity, hash: {} };
}

const makeNode = <T>(key:string,value: T): LRUNode<T> => {
    // @ts-ignore
    return { prev: null, next: null, value, key };
}

const removeNode = <T>(node: LRUNode<T>) => {
    node.prev.next = node.next;
    node.next.prev = node.prev;
    // @ts-ignore
    node.next = null;
    // @ts-ignore
    node.prev = null;
    return node;
}
const addNodeToFront = <T>(node: LRUNode<T>, cache: LRUCache<T>) => {
    const head = cache.head;
    node.next = head.next;
    node.prev = head;
    head.next.prev = node;
    head.next = node;
}

export const cacheGet = <T>(key: string, cache: LRUCache<T>): T | undefined => {
    const node = cache.hash[key];
    if (node) {
        removeNode(node);
        addNodeToFront(node, cache);
        return node.value;
    }
    return undefined;
}

export const cachePut = <T>(key: string, value: T, cache: LRUCache<T>) => {
    const node = cache.hash[key];
    if (node) {
        node.value = value;
        removeNode(node);
        addNodeToFront(node, cache);
    } else {
        const newNode = makeNode(key,value);
        cache.hash[key] = newNode;
        addNodeToFront(newNode, cache);
        cache.size++;
        if (cache.size > cache.capacity) {
            const tail = cache.tail.prev;
            removeNode(tail);
            delete cache.hash[tail.key];
            cache.size--;
        }
    }
}



