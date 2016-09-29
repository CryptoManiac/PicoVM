
/**
 * Very, very, very simple testing program.
 */

using System;

class FibLoop
{
    static long fib(long n)
    {
        if (n <= 1)
            return n;

        long fibo = 1;
        long fiboPrev = 1;

        for (long i = 2; i < n; ++i)
        {
            long temp = fibo;
            fibo += fiboPrev;
            fiboPrev = temp;
        }

        return fibo;
    }

    static void Main(string[] args)
    {
        for (long n = 0; n <= 35; ++n)
        {
            Console.WriteLine(fib(n));
        }
    }
}
