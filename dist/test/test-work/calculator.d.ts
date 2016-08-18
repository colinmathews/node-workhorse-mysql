import { IRunnable, Workhorse, Response, Work } from 'node-workhorse';
export default class Calculator implements IRunnable {
    errors: Error[];
    workhorse: Workhorse;
    run(work: Work): Promise<Response>;
    onChildrenDone(work: Work): Promise<any>;
    private createChildWork(input);
}
