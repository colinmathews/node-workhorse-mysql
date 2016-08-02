import { Runnable, Workhorse, Response, Work } from 'node-workhorse';
export default class Calculator implements Runnable {
    errors: Error[];
    workhorse: Workhorse;
    run(work: Work): Promise<Response>;
    onChildrenDone(work: Work): Promise<any>;
    private createChildWork(input);
}
