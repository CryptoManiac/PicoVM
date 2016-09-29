/**
 * Very, very, very simple testing program.
 */

using System;

class FibLoop
{
    static uint fib(uint n)
    {
        if (n <= 1)
            return n;

        uint fibo = 1;
        uint fiboPrev = 1;

        for (uint i = 2; i < n; ++i)
        {
            uint temp = fibo;

            Console.WriteLine("N:");
            Console.WriteLine(n);

            Console.WriteLine("Itetation:");
            Console.WriteLine(i);

            Console.WriteLine("TEMP:");
            Console.WriteLine(temp);

            fibo += fiboPrev;
            fiboPrev = temp;
        }

        return fibo;
    }

    static void Main(string[] args)
    {
        for (uint n = 0; n <= 45; ++n)
        {
           Console.WriteLine(fib(n));
        }
    }
}
